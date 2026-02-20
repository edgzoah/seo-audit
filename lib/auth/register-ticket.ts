import { randomUUID } from "node:crypto";

interface TicketRecord {
  email: string;
  expiresAt: number;
}

const TTL_MS = 2 * 60 * 1000;

declare global {
  var __registerTickets: Map<string, TicketRecord> | undefined;
}

function store(): Map<string, TicketRecord> {
  if (!global.__registerTickets) {
    global.__registerTickets = new Map<string, TicketRecord>();
  }
  return global.__registerTickets;
}

function cleanup(now = Date.now()): void {
  const s = store();
  for (const [key, value] of s.entries()) {
    if (value.expiresAt <= now) {
      s.delete(key);
    }
  }
}

export function issueRegisterTicket(email: string): string {
  cleanup();
  const ticket = randomUUID();
  store().set(ticket, {
    email,
    expiresAt: Date.now() + TTL_MS,
  });
  return ticket;
}

export function consumeRegisterTicket(ticket: string): string | null {
  cleanup();
  const s = store();
  const found = s.get(ticket);
  if (!found) return null;
  s.delete(ticket);
  return found.email;
}
