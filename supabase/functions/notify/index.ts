// supabase/functions/notify/index.ts
//
// Triggered by a Supabase Database Webhook on the `requests` table
// for INSERT and UPDATE events. Sends transactional emails via Resend.
//
// Required secrets (set with `supabase secrets set`):
//   RESEND_API_KEY      - your Resend API key
//   FROM_EMAIL          - verified sender, e.g. "Fund Tracker <fund@yourdomain.com>"
//   APP_URL             - e.g. "https://your-app.netlify.app"
//   SUPABASE_URL        - project URL (auto-provided)
//   SUPABASE_SERVICE_ROLE_KEY - service role key (auto-provided)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL")!;
const APP_URL = Deno.env.get("APP_URL")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function sendEmail(to: string[], subject: string, html: string) {
  if (!to.length) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    console.error("Resend error:", await res.text());
  }
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    // Supabase DB webhook payload shape:
    // { type: "INSERT" | "UPDATE" | "DELETE", table, record, old_record, schema }
    const { type, record, old_record } = payload;

    if (!record) return new Response("ok", { status: 200 });

    // Look up the requester's profile
    const { data: requester } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", record.user_id)
      .single();

    if (type === "INSERT") {
      // New request submitted (status will be 'pending' unless auto-declined)
      if (record.status === "pending") {
        // Notify all deputies + admins
        const { data: reviewers } = await supabase
          .from("profiles")
          .select("email")
          .in("role", ["approver", "admin"]);

        const to = (reviewers ?? []).map((r) => r.email);
        await sendEmail(
          to,
          `New fund request: $${record.amount} — ${record.category}`,
          `
            <p>A new exploratory fund request needs your review.</p>
            <p><b>From:</b> ${requester?.full_name ?? requester?.email}</p>
            <p><b>Amount:</b> $${record.amount}</p>
            <p><b>Category:</b> ${record.category}</p>
            <p><b>Details:</b> ${record.details}</p>
            <p><a href="${APP_URL}/review">Review this request →</a></p>
          `
        );
      } else if (record.status === "declined") {
        // Auto-declined on submission — let the requester know immediately
        await sendEmail(
          [requester?.email].filter(Boolean) as string[],
          `Your fund request was automatically declined`,
          `
            <p>Your request for $${record.amount} (${record.category}) was automatically declined.</p>
            <p><b>Reason:</b> ${record.reviewer_comment ?? "Exceeds remaining fund balance"}</p>
            <p>You can edit and resubmit a smaller amount in the app.</p>
            <p><a href="${APP_URL}">Open the fund tracker →</a></p>
          `
        );
      }
      return new Response("ok", { status: 200 });
    }

    if (type === "UPDATE") {
      const statusChanged = old_record && old_record.status !== record.status;
      if (!statusChanged) return new Response("ok", { status: 200 });

      // Resubmission after revision (old: needs_revision -> new: pending) — notify reviewers again
      if (old_record.status === "needs_revision" && record.status === "pending") {
        const { data: reviewers } = await supabase
          .from("profiles")
          .select("email")
          .in("role", ["approver", "admin"]);

        await sendEmail(
          (reviewers ?? []).map((r) => r.email),
          `Revised request resubmitted: $${record.amount}`,
          `
            <p>${requester?.full_name ?? requester?.email} resubmitted a revised request.</p>
            <p><b>Amount:</b> $${record.amount}</p>
            <p><b>Category:</b> ${record.category}</p>
            <p><b>Details:</b> ${record.details}</p>
            <p><a href="${APP_URL}/review">Review this request →</a></p>
          `
        );
        return new Response("ok", { status: 200 });
      }

      // Approver/admin made a decision — notify the requester
      if (["approved", "declined", "needs_revision"].includes(record.status)) {
        const statusLabel: Record<string, string> = {
          approved: "✅ Approved",
          declined: "❌ Declined",
          needs_revision: "✏️ Needs revision",
        };

        await sendEmail(
          [requester?.email].filter(Boolean) as string[],
          `Your fund request was ${record.status.replace("_", " ")}`,
          `
            <p>Your request for $${record.amount} (${record.category}) has a new status:</p>
            <p style="font-size:1.2em"><b>${statusLabel[record.status]}</b></p>
            ${record.reviewer_comment ? `<p><b>Reviewer note:</b> ${record.reviewer_comment}</p>` : ""}
            <p><a href="${APP_URL}">Open the fund tracker →</a></p>
          `
        );
      }
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
