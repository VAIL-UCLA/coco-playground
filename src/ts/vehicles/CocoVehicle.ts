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
		// Lower top speed than the default car (~22 → ~16 in top gear).
		this.gearboxMaxSpeeds = {
			'R': -3,
			'0': 0,
			'1': 4,
			'2': 7,
			'3': 10,
			'4': 13,
			'5': 16,
		};

		// COCO-specific stability tuning.
		this.maxSteerVal = 0.6;
		this.rayCastVehicle.wheelInfos.forEach((wheelInfo) => {
			wheelInfo.rollInfluence = 0.5;
		});
	}
}
