/**
 * TicketCard — карточка заявки с трекером статусов и журналом событий
 */
import { useState } from 'react';
import {
  TICKET_STATUS_LABELS, TICKET_STATUS_STYLES,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITY_STYLES,
  TICKET_CATEGORY_LABELS, TICKET_TRACK_STEPS, TICKET_TRACK_STEP_LABELS,
} from '../lib/desk';
import { formatDateTime, formatRelativeTime } from '../lib/api';

export function TicketTracker({ status }) {
  if (status === 'cancelled') {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        Заявка отменена
      </p>
    );
  }
  const currentIndex = TICKET_TRACK_STEPS.indexOf(status);
  return (
    <div className="flex items-center gap-2">
      {TICKET_TRACK_STEPS.map((step, i) => {
        const reached = i <= currentIndex;
        return (
          <div key={step} className="flex flex-1 items-center gap-2">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                  reached
                    ? i === currentIndex
                      ? 'bg-[#e63a2e] text-white shadow-sm'
                      : 'bg-emerald-500 text-white'
                    : 'border border-slate-300 bg-white text-slate-400'
                }`}
              >
                {reached && i < currentIndex ? '✓' : i + 1}
              </span>
              <span className={`text-[11px] font-semibold ${reached ? 'text-[#1f2937]' : 'text-slate-400'}`}>
                {TICKET_TRACK_STEP_LABELS[step]}
              </span>
            </div>
            {i < TICKET_TRACK_STEPS.length - 1 && (
              <span className={`mt-[-18px] h-0.5 flex-1 rounded-full ${i < currentIndex ? 'bg-emerald-500/60' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TicketEvents({ events }) {
  if (!events || events.length === 0) return null;
  return (
    <ol className="mt-3 space-y-2.5 border-l border-slate-200 pl-4">
      {[...events].reverse().map((ev) => (
        <li key={ev.id} className="relative text-sm">
          <span className="absolute -left-[21.5px] top-1.5 h-2 w-2 rounded-full bg-[#e63a2e]" />
          <p className="text-slate-700">{ev.message}</p>
          <p className="text-xs text-slate-400">
            {ev.author} · {formatDateTime(ev.created_at)}
          </p>
        </li>
      ))}
    </ol>
  );
}

export default function TicketCard({ ticket, isAdmin, onUpdate, onComment, busy }) {
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState('');

  const statusStyle = TICKET_STATUS_STYLES[ticket.status] || TICKET_STATUS_STYLES.new;
  const prioStyle = TICKET_PRIORITY_STYLES[ticket.priority] || TICKET_PRIORITY_STYLES.normal;

  const advance = () => {
    const next = ticket.status === 'new' ? 'in_progress' : 'done';
    onUpdate(ticket, { status: next, comment: '' });
  };

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-400">№{ticket.id}</span>
            <h3 className="font-bold text-[#1f2937]">{ticket.title}</h3>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyle}`}>
              {TICKET_STATUS_LABELS[ticket.status]}
            </span>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${prioStyle}`}>
              {TICKET_PRIORITY_LABELS[ticket.priority]}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">
              {TICKET_CATEGORY_LABELS[ticket.category] || ticket.category}
            </span>
          </div>
          {ticket.description && <p className="mt-2 text-sm text-slate-600">{ticket.description}</p>}
          <p className="mt-2 text-xs text-slate-400">
            {ticket.employee_name}
            {ticket.employee_room ? ` · каб. ${ticket.employee_room}` : ''}
            {ticket.employee_phone ? ` · тел. ${ticket.employee_phone}` : ''}
            {ticket.ip_address ? ` · IP: ${ticket.ip_address}` : ''} · создана {formatRelativeTime(ticket.created_at)}
            {ticket.assignee ? ` · исполнитель: ${ticket.assignee}` : ''}
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            {ticket.status === 'new' && (
              <button className="rounded-lg bg-[#e63a2e] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#c9301f] disabled:opacity-50" disabled={busy} onClick={advance}>
                Взять в работу
              </button>
            )}
            {ticket.status === 'in_progress' && (
              <button className="rounded-lg bg-[#e63a2e] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#c9301f] disabled:opacity-50" disabled={busy} onClick={advance}>
                Выполнена
              </button>
            )}
            {(ticket.status === 'new' || ticket.status === 'in_progress') && (
              <button
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-rose-300 hover:text-rose-600 disabled:opacity-50"
                disabled={busy}
                onClick={() => onUpdate(ticket, { status: 'cancelled', comment: '' })}
              >
                Отменить
              </button>
            )}
            {(ticket.status === 'done' || ticket.status === 'cancelled') && (
              <button
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 disabled:opacity-50"
                disabled={busy}
                onClick={() => onUpdate(ticket, { status: 'new', comment: '' })}
              >
                Вернуть
              </button>
            )}
          </div>
        )}
      </div>

      {/* Трекер */}
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <TicketTracker status={ticket.status} />
      </div>

      {/* Журнал */}
      <button
        className="mt-3 text-xs font-semibold text-[#e63a2e] transition-colors hover:text-[#c9301f]"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? 'Скрыть историю' : `История заявки (${ticket.events?.length || 0})`}
      </button>
      {expanded && <TicketEvents events={ticket.events} />}

      {/* Комментарий */}
      {onComment && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!comment.trim()) return;
            onComment(ticket, comment.trim());
            setComment('');
          }}
        >
          <input
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20"
            placeholder={isAdmin ? 'Добавить комментарий…' : 'Написать уточнение исполнителю…'}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button className="rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 disabled:opacity-50" disabled={busy || !comment.trim()}>Отправить</button>
        </form>
      )}
    </article>
  );
}
