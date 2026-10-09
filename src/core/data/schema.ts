// Схемы данных (импортируются db.ts и tools/build-db.ts)
export type CareerId = 'coder' | 'writer' | 'designer' | 'sound' | 'director' | 'producer' | 'hw' | 'hacker';
export type TrainingId = 'stroll' | 'reading' | 'movie' | 'anime' | 'game' | 'jogging' | 'pinball' | 'meditate' | 'concert' | 'netsurf' | 'museum' | 'college' | 'lab' | 'shorttrip' | 'longtrip' | 'retreat' | null;

/** Канонические id тренировок в порядке строк БД (trainings.id 1..15 = индекс+1).
 *  P1-9 аудита-51: в unlockedTrainings пишем эти id; записи-имена старых сейвов («散歩 walk»)
 *  продолжают матчиться через hasTraining (shared/rules). */
export const TRAINING_IDS: NonNullable<TrainingId>[] = [
  'stroll', 'reading', 'movie', 'anime', 'game', 'jogging', 'pinball', 'meditate',
  'concert', 'netsurf', 'museum', 'college', 'lab', 'shorttrip', 'longtrip',
];
export type PopGrade = 'A' | 'B' | 'C';
export interface GenreData { id: string; name: string; ru: string; popularity: PopGrade; costWan: number; unlockJob: CareerId | null; unlockLevel: number | null; }
export interface TypeData { id: string; name: string; nameRu: string | null; popularity: PopGrade; unlockJob: CareerId | null; unlockLevel: number | null; unlockTraining: TrainingId; }
export interface ConsoleData { id: string; name: string; devCost: number; licenseCost: number; company: string; unlock: [number, number, number] | string | null; removed: [number, number, number] | null; installBase: number; costMult: number; }
export interface StaffData { id: string; name: string; gender: string; salary: number; hireFee: number; maxPower: number; stats: { program: number; scenario: number; graphics: number; sound: number }; careers: Record<CareerId, number>; activeCareer: CareerId; unlock: string; persona: string | null; }
export interface ReviewMessage { points: number; message: string; }
