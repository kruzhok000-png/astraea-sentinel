export const colors = {
  navy: 0x10152f,
  indigo: 0x4338ca,
  violet: 0x7c3aed,
  silver: 0xb8c1d9,
  success: 0x2dd4a8,
  danger: 0xe05270,
  warning: 0xf0b45c,
} as const;

export const statusLabel = {
  DRAFT: 'Черновик', NEW: 'Новая', IN_REVIEW: 'На рассмотрении', NEEDS_INFO: 'Нужны уточнения',
  ON_HOLD: 'Пауза', APPROVED: 'Одобрена', REJECTED: 'Отклонена', APPEAL: 'Апелляция', CANCELLED: 'Отменена',
} as const;
