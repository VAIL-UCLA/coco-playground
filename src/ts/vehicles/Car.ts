import * as CANNON from 'cannon';

import { Vehicle } from './Vehicle';
import { IControllable } from '../interfaces/IControllable';
import { KeyBinding } from '../core/KeyBinding';
import * as THREE from 'three';
import * as Utils from '../core/FunctionLibrary';
import { SpringSimulator } from '../physics/spring_simulation/SpringSimulator';
import { World } from '../world/World';
import { EntityType } from '../enums/EntityType';
import { FollowPath } from '../characters/character_ai/FollowPath';
import { PathNode } from '../world/PathNode';

export class Car extends Vehicle implements IControllable
{
	public entityType: EntityType = EntityType.Car;
	public drive: string = 'awd';
	get speed(): number {
		return this._speed;
	}
	private _speed: number = 0;

	// private wheelsDebug: THREE.Mesh[] = [];
	private steeringWheel: THREE.Object3D;
	private airSpinTimer: number = 0;

	private steeringSimulator: SpringSimulator;
	private gear: number = 1;
	private autoDriveEnabled: boolean = false;

	// Transmission
	private shiftTimer: number;
	private timeToShift: number = 0.2;

	private canTiltForwards: boolean = false;
	private characterWantsToExit: boolean = false;

	/** Steering cap used in drift correction (subclasses may lower for stability). */
	protected maxSteerVal: number = 0.8;

	/** Per-gear forward/reverse speed caps used by the transmission logic (subclasses may replace). */
	protected gearboxMaxSpeeds: Record<string, number> = {
		'R': -2,
		'0': 0,
		'1': 3,
		'2': 5,
		'3': 7,
		'4': 9,
		'5': 12,
	};

	/** Engine force used in transmission logic (subclasses may lower for stability). */
	protected engineForce: number = 300;

	constructor(gltf: any)
	{
		super(gltf, {
			radius: 0.25,
			suspensionStiffness: 20,
			suspensionRestLength: 0.35,
			maxSuspensionTravel: 1,
			frictionSlip: 0.8,
			dampingRelaxation: 2,
			dampingCompression: 2,
			rollInfluence: 0.8
		});

		this.readCarData(gltf);

		this.collision.preStep = (body: CANNON.Body) => { this.physicsPreStep(body, this); };

		this.actions = {
			'throttle': new KeyBinding('KeyW'),
			'reverse': new KeyBinding('KeyS'),
			'brake': new KeyBinding('Space'),
			'left': new KeyBinding('KeyA'),
			'right': new KeyBinding('KeyD'),
			'auto_drive_toggle': new KeyBinding('KeyM'),
			'exitVehicle': new KeyBinding('KeyF'),
			'seat_switch': new KeyBinding('KeyX'),
			'view': new KeyBinding('KeyV'),
		};

		this.steeringSimulator = new SpringSimulator(60, 10, 0.6);
	}

	public noDirectionPressed(): boolean
	{
		let result = 
		!this.actions.throttle.isPressed &&
		!this.actions.reverse.isPressed &&
		!this.actions.left.isPressed &&
		!this.actions.right.isPressed;

		return result;
	}

	public update(timeStep: number): void
	{
		super.update(timeStep);
		if (this.controllingCharacter === undefined && this.autoDriveEnabled)
		{
			this.autoDriveEnabled = false;
		}

		const tiresHaveContact = this.rayCastVehicle.numWheelsOnGround > 0;

		// Air spin
		if (!tiresHaveContact)
		{
			// Timer grows when car is off ground, resets once you touch the ground again
			this.airSpinTimer += timeStep;
			if (!this.actions.throttle.isPressed) this.canTiltForwards = true;
		}
		else
		{
			this.canTiltForwards = false;
			this.airSpinTimer = 0;
		}

		// Engine
		const maxGears = 5;
		const cap = this.gearboxMaxSpeeds;

		if (this.shiftTimer > 0)
		{
			this.shiftTimer -= timeStep;
			if (this.shiftTimer < 0) this.shiftTimer = 0;
		}
		else
		{
			// Transmission 
			if (this.actions.reverse.isPressed)
			{
				const powerFactor = (cap['R'] - this.speed) / Math.abs(cap['R']);
				const force = (this.engineForce / this.gear) * (Math.abs(powerFactor) ** 1);

				this.applyEngineForce(force);
			}
			else
			{
				const g = String(this.gear);
				const g1 = String(this.gear - 1);
				const powerFactor = (cap[g] - this.speed) / (cap[g] - cap[g1]);

				if (powerFactor < 0.1 && this.gear < maxGears) this.shiftUp();
				else if (this.gear > 1 && powerFactor > 1.2) this.shiftDown();
				else if (this.actions.throttle.isPressed)
				{
					const force = (this.engineForce / this.gear) * (powerFactor ** 1);
					this.applyEngineForce(-force);
				}
			}
		}

		// Steering
		this.steeringSimulator.simulate(timeStep);
		this.setSteeringValue(this.steeringSimulator.position);
		if (this.steeringWheel !== undefined) this.steeringWheel.rotation.z = -this.steeringSimulator.position * 2;

		if (this.rayCastVehicle.numWheelsOnGround < 3 && Math.abs(this.collision.velocity.length()) < 0.5)	
		{	
			this.collision.quaternion.copy(this.collision.initQuaternion);	
		}

		// Getting out
		if (this.characterWantsToExit && this.controllingCharacter !== undefined && this.controllingCharacter.charState.canLeaveVehicles)
		{
			let speed = this.collision.velocity.length();

			if (speed > 0.1 && speed < 4)
			{
				this.triggerAction('brake', true);
			}
			else
			{
				this.forceCharacterOut();
			}
		}
	}

	public shiftUp(): void
	{
		this.gear++;
		this.shiftTimer = this.timeToShift;

		this.applyEngineForce(0);
	}

	public shiftDown(): void
	{
		this.gear--;
		this.shiftTimer = this.timeToShift;

		this.applyEngineForce(0);
	}

	public physicsPreStep(body: CANNON.Body, car: Car): void
	{
		// Constants
		const quat = Utils.threeQuat(body.quaternion);
		const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
		const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
		const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);

		// Measure speed
		this._speed = this.collision.velocity.dot(Utils.cannonVector(forward));

		// Air spin
		// It takes 2 seconds until you have max spin air control since you leave the ground
		let airSpinInfluence = THREE.MathUtils.clamp(this.airSpinTimer / 2, 0, 1);
		airSpinInfluence *= THREE.MathUtils.clamp(this.speed, 0, 1);
		
		const flipSpeedFactor = THREE.MathUtils.clamp(1 - this.speed, 0, 1);
		const upFactor = (up.dot(new THREE.Vector3(0, -1, 0)) / 2) + 0.5;
		const flipOverInfluence = flipSpeedFactor * upFactor * 3;

		const maxAirSpinMagnitude = 2.0;
		const airSpinAcceleration = 0.15;
		const angVel = this.collision.angularVelocity;

		const spinVectorForward = Utils.cannonVector(forward.clone());
		const spinVectorRight = Utils.cannonVector(right.clone());

		const effectiveSpinVectorForward = Utils.cannonVector(forward.clone().multiplyScalar(airSpinAcceleration * (airSpinInfluence + flipOverInfluence)));
		const effectiveSpinVectorRight = Utils.cannonVector(right.clone().multiplyScalar(airSpinAcceleration * (airSpinInfluence)));

		// Right
		if (this.actions.right.isPressed && !this.actions.left.isPressed) {
			if (angVel.dot(spinVectorForward) < maxAirSpinMagnitude) {
				angVel.vadd(effectiveSpinVectorForward, angVel);
			}
		} else
		// Left
		if (this.actions.left.isPressed && !this.actions.right.isPressed) {
			if (angVel.dot(spinVectorForward) > -maxAirSpinMagnitude) {
				angVel.vsub(effectiveSpinVectorForward, angVel);
			}
		}

		// Forwards
		if (this.canTiltForwards && this.actions.throttle.isPressed && !this.actions.reverse.isPressed) {
			if (angVel.dot(spinVectorRight) < maxAirSpinMagnitude) {
				angVel.vadd(effectiveSpinVectorRight, angVel);
			}
		} else
		// Backwards
		if (this.actions.reverse.isPressed && !this.actions.throttle.isPressed) {
			if (angVel.dot(spinVectorRight) > -maxAirSpinMagnitude) {
				angVel.vsub(effectiveSpinVectorRight, angVel);
			}
		}

		// Steering
		const velocity = new CANNON.Vec3().copy(this.collision.velocity);
		velocity.normalize();
		let driftCorrection = Utils.getSignedAngleBetweenVectors(Utils.threeVector(velocity), forward);

		let speedFactor = THREE.MathUtils.clamp(this.speed * 0.3, 1, Number.MAX_VALUE);

		if (this.actions.right.isPressed)
		{
			let steering = Math.min(-this.maxSteerVal / speedFactor, -driftCorrection);
			this.steeringSimulator.target = THREE.MathUtils.clamp(steering, -this.maxSteerVal, this.maxSteerVal);
		}
		else if (this.actions.left.isPressed)
		{
			let steering = Math.max(this.maxSteerVal / speedFactor, -driftCorrection);
			this.steeringSimulator.target = THREE.MathUtils.clamp(steering, -this.maxSteerVal, this.maxSteerVal);
		}
		else this.steeringSimulator.target = 0;

		// Update doors
		this.seats.forEach((seat) => {
			seat.door?.preStepCallback();
		});
	}

	public onInputChange(): void {
		super.onInputChange();

		const brakeForce = 1000000;

		if (this.actions.exitVehicle.justPressed)
		{
			this.characterWantsToExit = true;
		}
		if (this.actions.exitVehicle.justReleased)
		{
			this.characterWantsToExit = false;
			this.triggerAction('brake', false);
		}
		if (this.actions.auto_drive_toggle.justPressed)
		{
			this.toggleAutoDrive();
		}
		if (this.actions.throttle.justReleased || this.actions.reverse.justReleased)
		{
			this.applyEngineForce(0);
		}
		if (this.actions.brake.justPressed)
		{
			this.setBrake(brakeForce, 'rwd');
		}
		if (this.actions.brake.justReleased)
		{
			this.setBrake(0, 'rwd');
		}
		if (this.actions.view.justPressed)
		{
			this.toggleFirstPersonView();
		}
	}

	public handleKeyboardEvent(event: KeyboardEvent, code: string, pressed: boolean): void
	{
		// In auto mode, accept only mode toggle + global combos.
		if (this.autoDriveEnabled)
		{
			const isToggleKey = code === 'KeyM';
			const isGlobalCombo = pressed && event.shiftKey && (code === 'KeyC' || code === 'KeyR');
			if (!isToggleKey && !isGlobalCombo) return;
		}

		super.handleKeyboardEvent(event, code, pressed);
	}

	private toggleAutoDrive(): void
	{
		if (this.controllingCharacter === undefined) return;

		if (this.autoDriveEnabled)
		{
			this.autoDriveEnabled = false;
			this.controllingCharacter.behaviour = undefined;
			this.resetControls();
			this.refreshDrivingControlsUI();
			return;
		}

		const startNode = this.findClosestPathNode();
		if (startNode === undefined)
		{
			console.warn('Auto mode unavailable: no path nodes found.');
			return;
		}

		this.controllingCharacter.setBehaviour(new FollowPath(startNode, 10));
		this.autoDriveEnabled = true;
		this.resetControls();
		this.refreshDrivingControlsUI();
	}

	private findClosestPathNode(): PathNode
	{
		let closest: PathNode = undefined;
		let bestDistanceSq = Number.POSITIVE_INFINITY;
		const nodeWorldPos = new THREE.Vector3();

		for (const path of this.world.paths)
		{
			for (const nodeName in path.nodes)
			{
				if (!Object.prototype.hasOwnProperty.call(path.nodes, nodeName)) continue;
				const node = path.nodes[nodeName];
				node.object.getWorldPosition(nodeWorldPos);
				const d2 = this.position.distanceToSquared(nodeWorldPos);
				if (d2 < bestDistanceSq)
				{
					bestDistanceSq = d2;
					closest = node;
				}
			}
		}

		return closest;
	}

	public inputReceiverInit(): void
	{
		super.inputReceiverInit();
		this.refreshDrivingControlsUI();
	}

	private refreshDrivingControlsUI(): void
	{
		this.world.updateControls([
			{
				keys: ['W', 'S'],
				desc: 'Accelerate, Brake / Reverse'
			},
			{
				keys: ['A', 'D'],
				desc: 'Steering'
			},
			{
				keys: ['Space'],
				desc: 'Handbrake'
			},
			{
				keys: ['V'],
				desc: 'View select'
			},
			{
				keys: ['M'],
				desc: `Manual / auto drive (current: ${this.autoDriveEnabled ? 'AUTO' : 'MANUAL'})`
			},
			{
				keys: ['F'],
				desc: 'Exit vehicle'
			},
			{
				keys: ['Shift', '+', 'R'],
				desc: 'Respawn'
			},
			{
				keys: ['Shift', '+', 'C'],
				desc: 'Free camera'
			},
		]);
	}

	public readCarData(gltf: any): void
	{
		gltf.scene.traverse((child: THREE.Object3D) => {
			if (child.hasOwnProperty('userData'))
			{
				if (child.userData.hasOwnProperty('data'))
				{
					if (child.userData.data === 'steering_wheel')
					{
						this.steeringWheel = child;
					}
				}
			}
		});
	}
}