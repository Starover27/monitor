/**
 * MedregLaunch — раздел «МИС МедРег»: запуск медицинской информационной системы.
 *
 * Как это работает:
 * 1) «Установить лаунчер» — скачивает medreg-launcher.reg (делается один раз):
 *    Windows регистрирует протокол medreg:// → \\192.168.88.1\bin\MedReg.exe.
 * 2) После этого «Открыть МедРег» запускает систему в один клик
 *    (Windows один раз спросит разрешение открыть внешнее приложение — «Да»).
 * 3) Если не запустилось — копировать путь и запускать вручную (Win+R).
 */
import { useState } from 'react';
import {
  MEDREG_PATH,
  launchMedreg,
  downloadMedregLauncher,
  copyMedregPath,
} from '../lib/medreg';

export default function MedregLaunch() {
  const [copied, setCopied] = useState(false);
  const [hint, setHint] = useState(null);

  const onLaunch = () => {
    launchMedreg();
    setHint('Если окно МедРег не открылось — Windows не знает протокол medreg://. Нажмите «Установить лаунчер» (делается один раз), затем повторите.');
  };

  const onInstall = () => {
    downloadMedregLauncher();
    setHint('Скачан файл medreg-launcher.reg. Двойной клик по нему и «Да» в подтверждении Windows — и кнопка «Открыть МедРег» будет работать в один клик.');
  };

  const onCopy = async () => {
    const ok = await copyMedregPath();
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Основная карточка запуска */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1 bg-[#0ea5e9]" />
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start gap-5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-3xl">🩺</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">МИС · медицинская информационная система</p>
              <h1 className="mt-0.5 text-2xl font-bold text-[#1f2937]">МедРег</h1>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                Карточка пациента, назначения, история и ордер — всё в одном окне.
                Система запускается с сервера 192.168.88.1.
              </p>
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
                {MEDREG_PATH}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={onLaunch}
              className="portal-btn rounded-xl bg-[#e63a2e] px-6 py-3 text-sm font-bold text-white shadow-[0_6px_16px_-6px_rgba(230,58,46,0.6)] hover:bg-[#c9301f]"
            >
              ▶ Открыть МедРег
            </button>
            <button
              onClick={onInstall}
              className="portal-btn rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-[#2b3a4b] hover:bg-slate-50"
            >
              ⚙ Установить лаунчер (один раз)
            </button>
            <button
              onClick={onCopy}
              className="portal-btn rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-[#2b3a4b] hover:bg-slate-50"
            >
              {copied ? '✓ Скопировано' : '📋 Скопировать путь'}
            </button>
          </div>

          {hint && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-700">
              {hint}
            </div>
          )}
        </div>
      </section>

      {/* Если не получилось */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-base font-bold text-[#1f2937]">Если МедРег не запускается</h2>
        <ol className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
          <li>
            <b>Первый запуск:</b> нажмите «Установить лаунчер», скачанный файл
            <span className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">medreg-launcher.reg</span>
            — двойной клик и «Да». После этого кнопка «Открыть МедРег» работает в один клик.
          </li>
          <li>
            <b>Без лаунчера:</b> нажмите <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">Win</span>+
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">R</span>, вставьте
            <span className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{MEDREG_PATH}</span>
            и нажмите «OK».
          </li>
          <li>
            Проверьте доступ к серверу: проводник →
            <span className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">\\192.168.88.1\bin</span>
            — папка должна быть видна.
          </li>
          <li>
            Всё равно не открывается — заявка в IT-поддержку: вн. 0100 или раздел «IT-поддержка» портала.
          </li>
        </ol>
      </section>
    </div>
  );
}
