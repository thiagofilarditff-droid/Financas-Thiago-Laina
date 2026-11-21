import { useState } from 'react';
import { currentMonth } from '../../domain/month';
import { payslipFor } from '../../domain/payslip';
import type { Month } from '../../domain/types';
import { useSnapshot } from '../../data/snapshot';
import { useHouseholdId } from '../../data/auth';
import { savePayslip, useWrite } from '../../data/mutations';
import MonthPicker from '../../ui/MonthPicker';
import PayslipCard from './PayslipCard';
import PayslipEditor from './PayslipEditor';
import OtherIncomes from './OtherIncomes';

export default function IncomesPage() {
  const householdId = useHouseholdId();
  const { data: snapshot, isLoading, error } = useSnapshot();
  const [month, setMonth] = useState<Month>(currentMonth());
  const [editingPerson, setEditingPerson] = useState<string | null>(null);
  const save = useWrite((a: { personId: string; validFrom: Month; lines: Parameters<typeof savePayslip>[3] }) =>
    savePayslip(householdId, a.personId, a.validFrom, a.lines));

  if (isLoading) return <p className="text-muted">Carregando…</p>;
  if (error || !snapshot) return <p role="alert" className="font-semibold text-warn">Não consegui carregar os dados.</p>;

  const editing = snapshot.people.find((p) => p.id === editingPerson);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Receitas e contracheques</h1>
        <MonthPicker value={month} onChange={setMonth} />
      </div>
      <div className="grid grid-cols-2 gap-6">
        {snapshot.people.map((p) => (
          <PayslipCard key={p.id} snapshot={snapshot} personId={p.id} month={month} onEdit={() => setEditingPerson(p.id)} />
        ))}
      </div>
      <OtherIncomes snapshot={snapshot} month={month} />
      {editing && (
        <PayslipEditor
          key={editing.id}
          personName={editing.name}
          initial={payslipFor(snapshot.payslips, editing.id, month)}
          busy={save.isPending}
          error={save.error ? (save.error as Error).message : null}
          onCancel={() => { save.reset(); setEditingPerson(null); }}
          onSave={(validFrom, lines) =>
            save.mutate({ personId: editing.id, validFrom, lines }, { onSuccess: () => setEditingPerson(null) })}
        />
      )}
    </div>
  );
}
