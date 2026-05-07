import * as CANNON from 'cannon';
import { Vehicle } from './Vehicle';
import { IControllable } from '../interfaces/IControllable';
import { EntityType } from '../enums/EntityType';
export declare class Car extends Vehicle implements IControllable {
    entityType: EntityType;
    drive: string;
    get speed(): number;
    private _speed;
    private steeringWheel;
    private airSpinTimer;
    private steeringSimulator;
    private gear;
    private autoDriveEnabled;
    private shiftTimer;
    private timeToShift;
    private canTiltForwards;
    private characterWantsToExit;
    /** Steering cap used in drift correction (subclasses may lower for stability). */
    protected maxSteerVal: number;
    /** Per-gear forward/reverse speed caps used by the transmission logic (subclasses may replace). */
    protected gearboxMaxSpeeds: Record<string, number>;
    /** Engine force used in transmission logic (subclasses may lower for stability). */
    protected engineForce: number;
    constructor(gltf: any);
    noDirectionPressed(): boolean;
    update(timeStep: number): void;
    shiftUp(): void;
    shiftDown(): void;
    physicsPreStep(body: CANNON.Body, car: Car): void;
    onInputChange(): void;
    handleKeyboardEvent(event: KeyboardEvent, code: string, pressed: boolean): void;
    private toggleAutoDrive;
    private findClosestPathNode;
    inputReceiverInit(): void;
    private refreshDrivingControlsUI;
    readCarData(gltf: any): void;
}
