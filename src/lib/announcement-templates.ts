import { prisma } from "@/lib/prisma";

// Starter templates seeded once (only while the table is empty) so the composer's
// template dropdown is useful out of the box. Users edit the loaded copy per-send;
// new templates come from the composer's "Save as template" button. Seeding only
// on empty means we never resurrect templates the user has since deleted.
const DEFAULT_TEMPLATES = [
  {
    name: "Rehearsal Reminder",
    subject: "Rehearsal reminder — [date]",
    bodyHtml:
      "<p>Hi everyone,</p><p>Reminder that we have rehearsal on <b>[day, date]</b> from <b>[start]–[end]</b> at <b>[location]</b>.</p><ul><li>Arrive 15 minutes early to set up</li><li>Bring your music and a pencil</li><li>Water and sunscreen recommended</li></ul><p>See you there!</p>",
  },
  {
    name: "Performance Day",
    subject: "Performance day details — [event]",
    bodyHtml:
      "<p>Hi everyone,</p><p>Here is everything you need for <b>[event]</b> on <b>[date]</b>:</p><ul><li><b>Call time:</b> [time], [location]</li><li><b>Uniform:</b> [uniform details]</li><li><b>Bring:</b> instrument, music, water</li><li><b>Pickup:</b> [time and place]</li></ul><p>Questions? Reply to this email.</p>",
  },
  {
    name: "General Update",
    subject: "Band update — [topic]",
    bodyHtml: "<p>Hi everyone,</p><p>[Write your update here.]</p><p>Thanks,<br />[Your name]</p>",
  },
];

export async function ensureDefaultTemplates(): Promise<void> {
  const count = await prisma.announcementTemplate.count();
  if (count > 0) return;
  await prisma.announcementTemplate.createMany({ data: DEFAULT_TEMPLATES });
}
