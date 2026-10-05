/**
 * medreg.js — запуск МИС «МедРег» с портала.
 *
 * Бrowsers не умеют запускать .exe по сетевому пути в один клик (защита ОС),
 * поэтому работаем через пользовательский протокол medreg://, который
 * регистрируется одноразовым .reg-файлом (кнопка «Установить лаунчер»).
 * После установки большой кнопка «Открыть МедРег» запускает систему в один клик.
 * Фолбэк — копирование сетевого пути и ручной запуск через Win+R.
 */
export const MEDREG_PATH = '\\\\192.168.88.1\\bin\\MedReg.exe';
export const MEDREG_PROTOCOL = 'medreg';

/** Пытаемся запустить МИС через зарегистрированный протокол medreg:// */
export function launchMedreg() {
  window.location.href = `${MEDREG_PROTOCOL}://open`;
}

/**
 * Содержимое .reg: регистрирует medreg:// → MEDREG_PATH
 * (в REG-файлах обратные слэши удваиваются).
 */
const MEDREG_REG = [
  'Windows Registry Editor Version 5.00',
  '',
  `[HKEY_CLASSES_ROOT\\${MEDREG_PROTOCOL}]`,
  '@="URL:MedReg protocol"',
  '"URL Protocol"=""',
  '',
  `[HKEY_CLASSES_ROOT\\${MEDREG_PROTOCOL}\\shell\\open\\command]`,
  `@="${MEDREG_PATH.replace(/\\/g, '\\\\')}"`,
  '',
].join('\r\n');

/** Скачивает файл medreg-launcher.reg (одноразовая установка лаунчера). */
export function downloadMedregLauncher() {
  const blob = new Blob([MEDREG_REG], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'medreg-launcher.reg';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
