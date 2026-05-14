"use client";

import { useEffect, useState } from "react";
import type { Schedule } from "@/types/raas";
import { RecurringScheduleForm } from "./RecurringScheduleForm";

interface Props {
  tenantSlug: string;
  tenantPrimaryColor: string;
}

export function SchedulesTab({ tenantSlug, tenantPrimaryColor }: Props) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const res = await fetch(
      `/api/r/schedules?tenant=${encodeURIComponent(tenantSlug)}`,
    );
    const data = (await res.json()) as { schedules: Schedule[] };
    setSchedules(data.schedules ?? []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Recurring schedules</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 text-sm rounded-md font-semibold text-black"
          style={{ background: tenantPrimaryColor }}
        >
          {showForm ? "Cancel" : "New"}
        </button>
      </div>

      {showForm && (
        <div className="border border-white/10 rounded-md p-4">
          <RecurringScheduleForm
            tenantSlug={tenantSlug}
            tenantPrimaryColor={tenantPrimaryColor}
            onCreated={() => {
              setShowForm(false);
              void load();
            }}
          />
        </div>
      )}

      {schedules.length === 0 ? (
        <p className="opacity-60 text-sm">No schedules yet.</p>
      ) : (
        <ul className="divide-y divide-white/10 border border-white/10 rounded-md">
          {schedules.map((s) => (
            <li
              key={s.schedule_id}
              className="p-3 flex justify-between items-center"
            >
              <div>
                <div className="font-semibold">{s.template.name_template}</div>
                <div className="text-xs opacity-60">
                  {s.cadence} · next:{" "}
                  {new Date(s.next_run_at).toLocaleString()} · runs:{" "}
                  {s.run_count}
                </div>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  s.status === "active"
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "bg-neutral-500/20 text-neutral-200"
                }`}
              >
                {s.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
