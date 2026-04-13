import { Car } from './Car';

/**
 * Same driving physics and controls as {@link Car}. Spawned when the world marks a vehicle as type
 * {@code coco}, which loads {@code build/assets/coco.glb} (your combined mesh + car rig).
 */
export class CocoVehicle extends Car
{
	constructor(gltf: any)
	{
		super(gltf);
		this.instantCharacterEnter = true;
		// Lower caps than stock car to reduce lateral load in turns (was ~16 top; now ~12).
		this.gearboxMaxSpeeds = {
			'R': -2,
			'0': 0,
			'1': 3,
			'2': 5,
			'3': 7,
			'4': 9,
			'5': 12,
		};

		// Less acceleration → less weight transfer when steering + throttle.
		this.engineForce = 360;

		// COCO-specific stability tuning (steer + roll).
		this.maxSteerVal = 0.5;
		this.rayCastVehicle.wheelInfos.forEach((wheelInfo) => {
			wheelInfo.rollInfluence = 0.38;
		});

		// Damp roll oscillation slightly (chassis only; car unchanged).
		this.collision.angularDamping = 0.35;
	}
}
