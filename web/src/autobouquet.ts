// Автосборка букетов «Цветка Стихий» (root/auto_bouquet_level/location_N). exe: объект 0x4091c0, пересчёт уровня 0x4093f0.

/**
 * Уровень по числу проданных в букетах цветов (exe 0x4093f0): пороги идут подряд — каждый следующий считается от
 * предыдущего (80, затем ещё 100). left — сколько ещё продать до следующего уровня (0x4094e0), frac — заполнение
 * полосы (0x409560), max — уровней больше нет.
 */
export function autoBouquetLevel(thresholds: number[], sold: number) {
  let rest = sold;
  let level = 0;
  for (const t of thresholds) {
    if (rest < t) break;
    rest -= t;
    level += 1;
  }
  const max = level >= thresholds.length;
  const need = max ? 0 : thresholds[level];
  return { level, max, left: max ? 0 : need - rest, frac: max || need <= 0 ? 0 : Math.min(1, Math.max(0, rest / need)) };
}
