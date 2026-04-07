import { Car } from './Car';
/**
 * Same driving physics and controls as {@link Car}. Spawned when the world marks a vehicle as type
 * {@code coco}, which loads {@code build/assets/coco.glb} (your combined mesh + car rig).
 */
export declare class CocoVehicle extends Car {
    constructor(gltf: any);
}
