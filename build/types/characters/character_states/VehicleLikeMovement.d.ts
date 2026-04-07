import { CharacterStateBase } from './_stateLibrary';
import { Character } from '../Character';
export declare class VehicleLikeMovement extends CharacterStateBase {
    private speed;
    private maxSpeed;
    private acceleration;
    private deceleration;
    private turnSpeed;
    constructor(character: Character);
    update(timeStep: number): void;
    onInputChange(): void;
    fallInAir(): void;
}
