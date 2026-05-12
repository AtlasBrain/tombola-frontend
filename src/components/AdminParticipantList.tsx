"use client";
import { formatSol, formatTickets } from "@/lib/format";
import { explorerAddressUrl } from "@/lib/explorer-url";
import { UserName } from "@/components/UserName";

interface Participant {
  owner: string;
  tickets: bigint;
  spentLamports: bigint;
}

interface Props {
  participants: Participant[] | null;
  rpcUrl: string;
}

export function AdminParticipantList({ participants, rpcUrl }: Props) {
  if (participants === null) return null;
  if (participants.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-6 text-center">
        <p className="font-display text-base uppercase text-neutral-300">
          No participants yet
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Share an invite code or invite friends from this pool&apos;s admin
          panel to bring buyers in.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
      <h3 className="mb-4 text-xs uppercase tracking-widest text-neutral-500">
        Participants ({participants.length})
      </h3>
      <div className="max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-neutral-900 text-xs uppercase text-neutral-500">
            <tr>
              <th className="py-2 text-left font-normal">Wallet</th>
              <th className="py-2 text-right font-normal">Tickets</th>
              <th className="py-2 text-right font-normal">Spent</th>
              <th className="py-2 text-right font-normal">Explorer</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr
                key={p.owner}
                className="border-t border-neutral-800/50 text-neutral-200"
              >
                <td className="py-2 font-mono text-xs">
                  <UserName wallet={p.owner} />
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatTickets(p.tickets)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatSol(p.spentLamports)}
                </td>
                <td className="py-2 text-right">
                  <a
                    href={explorerAddressUrl(p.owner, rpcUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-500 hover:text-neutral-300"
                  >
                    ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
