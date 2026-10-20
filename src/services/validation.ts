import { z } from 'zod';

export const ageRanges = ['13–17', '18–24', '25–34', '35+'] as const;
const answer = (max: number) => z.string().trim().min(1, 'Ответ не может быть пустым.').max(max);
export const profileSchema = z.object({
  gameNickname: answer(80), projectServer: answer(100), timezone: answer(30),
  ageRange: z.string().transform((value) => value.trim().replaceAll('-', '–')).pipe(z.enum(ageRanges, { error: 'Выберите диапазон: 13–17, 18–24, 25–34 или 35+.' })),
  previousExperience: z.string().trim().max(700).optional(),
});
export const motivationSchema = z.object({
  motivation: answer(900), contribution: answer(900), weeklyActivity: answer(100),
  profileUrl: z.string().trim().url('Ссылка должна быть корректным URL.').refine((value) => value.startsWith('https://'), 'Разрешены только HTTPS-ссылки.').max(300).optional(),
});
