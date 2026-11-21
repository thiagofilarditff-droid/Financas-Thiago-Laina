import { useState } from 'react';
import type { Card, Month, Snapshot } from '../../domain/types';
import { addMonths, currentMonth, monthLabel } from '../../domain/month';
import { isActiveIn } from '../../domain/expenses';
import { cardLimitUsedCents, projectedItemsFor } from '../../domain/installments';
import { useSnapshot } from '../../data/snapshot';
import { useHouseholdId } from '../../data/auth';
import { archiveCard, createManualPlan, saveManualInvoice, upsertCard, useWrite } from '../../data/mutations';
import Money from '../../ui/Money';
import ImportInvoiceDialog from '../import/ImportInvoiceDialog';
import CardForm, { type CardDraft } from './CardForm';
import CardInvoices, { ManualInvoiceForm } from './CardInvoices';
import ManualInstallmentForm, { type ManualPlanDraft } from './ManualInstallmentForm';

type Panel = 'edit' | 'manual' | 'plan' | null;
const action = 'rounded-inner border border-line px-3 py-1.5 text-sm font-bold text-accent';

/** Month of the card's next due date: this month until its due day has passed, then the next one. */
function nextDueMonth(card: Card, today: Date): Month {
  const m = currentMonth();
  return today.getDate() > card.dueDay ? addMonths(m, 1) : m;
}

function NextInvoice({ card, snapshot }: { card: Card; snapshot: Snapshot }) {
  const m = nextDueMonth(card, new Date());
  const inv = snapshot.invoices.find((i) => i.cardId === card.id && i.dueMonth === m);
  if (inv) {
    return <>Próxima fatura: {monthLabel(m)} · <Money cents={inv.totalCents} symbol />{inv.paid && ' ✓'}</>;
  }
  // Before the invoice arrives: projected installments + fixed expenses paid on this card.
  const projected = projectedItemsFor(snapshot.plans, snapshot.items, snapshot.invoices, card.id, m)
    .reduce((s, p) => s + p.amountCents, 0)
    + snapshot.expenses.filter((e) => e.isFixed && e.paymentMethod === 'card' && e.cardId === card.id && isActiveIn(e, m))
      .reduce((s, e) => s + e.defaultCents, 0);
  return <>Próxima fatura: {monthLabel(m)} · <span className="italic">prevista <Money cents={projected} symbol /></span></>;
}

function CardTile({ card, snapshot, onImport }: { card: Card; snapshot: Snapshot; onImport(): void }) {
  const householdId = useHouseholdId();
  const today = currentMonth();
  const [panel, setPanel] = useState<Panel>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const save = useWrite((c: CardDraft) => upsertCard(householdId, c));
  const manual = useWrite((a: { dueMonth: Month; totalCents: number }) => saveManualInvoice(householdId, card.id, a.dueMonth, a.totalCents));
  const plan = useWrite((p: ManualPlanDraft) => createManualPlan(householdId, card.id, p.description, p.installmentCents, p.total, p.firstDueMonth));
  const archive = useWrite(() => archiveCard(card.id));

  // The whole snapshot goes in (all invoices, items and plans), so no installment is counted twice.
  const used = cardLimitUsedCents(snapshot, card.id, today);
  const pct = card.limitCents > 0 ? Math.min(100, (used / card.limitCents) * 100) : 0;
  const holder = snapshot.people.find((p) => p.id === card.holderPersonId)?.name;
  const inUse = snapshot.invoices.some((i) => i.cardId === card.id) || snapshot.plans.some((p) => p.cardId === card.id)
    || snapshot.expenses.some((e) => e.cardId === card.id);
  const open = (p: Panel) => { save.reset(); manual.reset(); plan.reset(); setPanel(p); };
  const error = (archive.error as Error | null)?.message;

  return (
    <section className={`rounded-card border border-line bg-card p-5 ${card.archived ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-start gap-3">
          <span className="mt-1 h-8 w-2 rounded-full" style={{ background: card.color }} />
          <div>
            <div className="text-lg font-extrabold">{card.name}{card.archived && <span className="ml-2 text-sm text-muted">(arquivado)</span>}</div>
            <div className="text-sm text-muted">
              {[card.bank, card.brand, holder, card.last4 ? `•••• ${card.last4}` : null].filter(Boolean).join(' · ')}
            </div>
            <div className="mt-1 text-sm"><NextInvoice card={card} snapshot={snapshot} /></div>
          </div>
        </div>
        <div className="w-80">
          <div className="flex justify-between text-sm">
            <span className="font-semibold">Limite usado</span>
            <span><Money cents={used} symbol />{card.limitCents > 0 && <span className="text-muted"> de <Money cents={card.limitCents} symbol /></span>}</span>
          </div>
          {card.limitCents > 0 ? (
            <div className="mt-1 h-2 rounded-full bg-line" role="progressbar" aria-label="Limite usado"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
              <div className={`h-2 rounded-full ${pct >= 90 ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
            </div>
          ) : <p className="text-xs text-muted">Sem limite cadastrado.</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!card.archived && (
          <>
            <button type="button" className={action} onClick={onImport}>Importar fatura (PDF)</button>
            <button type="button" className={action} onClick={() => open('manual')}>Lançar total à mão</button>
            <button type="button" className={action} onClick={() => open('plan')}>Compra parcelada</button>
          </>
        )}
        <span className="flex-1" />
        <button type="button" className="text-sm font-bold text-accent" onClick={() => open('edit')}>Editar</button>
        {card.archived ? (
          <button type="button" className="text-sm font-bold text-accent" disabled={save.isPending}
            onClick={() => save.mutate({ ...card, archived: false })}>Reativar</button>
        ) : confirmArchive ? (
          <>
            <button type="button" className="text-sm font-bold text-warn" disabled={archive.isPending}
              onClick={() => archive.mutate(undefined, { onSuccess: () => setConfirmArchive(false) })}>
              {inUse ? 'Confirmar arquivamento?' : 'Confirmar exclusão?'}
            </button>
            <button type="button" className="text-sm font-bold text-muted" onClick={() => setConfirmArchive(false)}>Cancelar</button>
          </>
        ) : (
          <button type="button" className="text-sm font-bold text-warn" onClick={() => setConfirmArchive(true)}
            title={inUse ? 'O cartão tem histórico: fica arquivado, sem apagar nada' : 'O cartão não tem histórico e será excluído'}>
            {inUse ? 'Arquivar' : 'Excluir'}
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-sm font-semibold text-warn">{error}</p>}

      {panel && (
        <div className="mt-4">
          {panel === 'edit' && (
            <CardForm people={snapshot.people} initial={card} busy={save.isPending}
              error={(save.error as Error | null)?.message ?? null} onCancel={() => setPanel(null)}
              onSubmit={(c) => save.mutate(c, { onSuccess: () => setPanel(null) })} />
          )}
          {panel === 'manual' && (
            <ManualInvoiceForm card={card} snapshot={snapshot} month={nextDueMonth(card, new Date())} busy={manual.isPending}
              error={(manual.error as Error | null)?.message ?? null} onCancel={() => setPanel(null)}
              onSubmit={(dueMonth, totalCents) => manual.mutate({ dueMonth, totalCents }, { onSuccess: () => setPanel(null) })} />
          )}
          {panel === 'plan' && (
            <ManualInstallmentForm month={nextDueMonth(card, new Date())} busy={plan.isPending}
              error={(plan.error as Error | null)?.message ?? null} onCancel={() => setPanel(null)}
              onSubmit={(p) => plan.mutate(p, { onSuccess: () => setPanel(null) })} />
          )}
        </div>
      )}

      <div className="mt-4">
        <h3 className="mb-1 text-sm font-extrabold uppercase tracking-wide text-muted">Faturas</h3>
        <CardInvoices card={card} snapshot={snapshot} today={today} />
      </div>
    </section>
  );
}

export default function CardsPage() {
  const householdId = useHouseholdId();
  const { data: snapshot, isLoading, error } = useSnapshot();
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [importFor, setImportFor] = useState<string | null>(null);
  const create = useWrite((c: CardDraft) => upsertCard(householdId, c));

  if (isLoading) return <p className="text-muted">Carregando…</p>;
  if (error || !snapshot) return <p role="alert" className="font-semibold text-warn">Não consegui carregar os dados.</p>;

  const active = snapshot.cards.filter((c) => !c.archived);
  const archived = snapshot.cards.filter((c) => c.archived);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Cartões</h1>
        {!adding && <button type="button" onClick={() => { create.reset(); setAdding(true); }} className="font-bold text-accent">+ Adicionar cartão</button>}
      </div>
      {adding && (
        <CardForm people={snapshot.people} initial={null} busy={create.isPending}
          error={(create.error as Error | null)?.message ?? null} onCancel={() => setAdding(false)}
          onSubmit={(c) => create.mutate(c, { onSuccess: () => setAdding(false) })} />
      )}
      {active.length === 0 && !adding && <p className="text-muted">Nenhum cartão cadastrado.</p>}
      {active.map((c) => <CardTile key={c.id} card={c} snapshot={snapshot} onImport={() => setImportFor(c.id)} />)}
      {archived.length > 0 && (
        <div>
          <button type="button" className="text-sm font-bold text-muted" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Ocultar arquivados' : `Mostrar arquivados (${archived.length})`}
          </button>
          {showArchived && (
            <div className="mt-3 flex flex-col gap-6">
              {archived.map((c) => <CardTile key={c.id} card={c} snapshot={snapshot} onImport={() => {}} />)}
            </div>
          )}
        </div>
      )}
      {importFor && <ImportInvoiceDialog snapshot={snapshot} initialCardId={importFor} onClose={() => setImportFor(null)} />}
    </div>
  );
}
