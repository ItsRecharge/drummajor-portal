import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata = { title: "Quick start guide — Drum Major Portal" };

// A plain, printable guide so each new drum-major class can run the portal
// without the person who set it up. Keep it task-oriented and short.

const TOC = [
  ["#yearly", "Yearly handoff checklist"],
  ["#rosters", "Rosters from Google Classroom"],
  ["#clear", "Clearing last year's roster"],
  ["#people", "Adding and removing drum majors"],
  ["#announce", "Sending announcements"],
  ["#music", "Adding music"],
  ["#handoff", "Handoff notes"],
] as const;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="text-lg uppercase tracking-wide">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm leading-6 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1 [&_kbd]:rounded [&_kbd]:border [&_kbd]:bg-muted [&_kbd]:px-1.5 [&_kbd]:py-0.5 [&_kbd]:font-mono [&_kbd]:text-xs [&_strong]:font-semibold">
        {children}
      </CardContent>
    </Card>
  );
}

export default async function GuidePage() {
  await requireAuth();
  return (
    <div className="grid gap-6">
      <div>
        <p className="eyebrow">Quick start</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight uppercase">How to run the portal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything a new drum-major class needs, in the order you&apos;ll need it. Print this
          page (<kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>P</kbd>) and keep it with the handoff notes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>On this page</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-1 text-sm sm:grid-cols-2">
            {TOC.map(([href, label], i) => (
              <li key={href}>
                <Link href={href} className="hover:underline">
                  {i + 1}. {label}
                </Link>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Section id="yearly" title="1. Yearly handoff checklist">
        <p>Do these in order at the start of each school year:</p>
        <ol>
          <li>
            <strong>Invite the new drum majors</strong> (user menu → <em>Invites</em>). Each person
            accepts the emailed link with their school address.
          </li>
          <li>
            <strong>Transfer admin</strong> if the head drum major is changing (user menu →{" "}
            <em>Members</em> → the new person → <em>Transfer admin</em>). Then remove or demote
            graduated members.
          </li>
          <li>
            <strong>Clear last year&apos;s roster</strong> (see section 3), then{" "}
            <strong>import this year&apos;s rosters</strong> from Google Classroom (section 2) — one
            file for Jazz Band, one for Concert/Marching Band.
          </li>
          <li>
            Send a short test announcement to yourself first: pick a group, send, and check that it
            arrives. Drum majors and admins always receive a copy of every announcement.
          </li>
          <li>
            Read last year&apos;s <em>Handoff</em> notes (user menu → <em>Handoff</em>) and add your
            own as the year goes on.
          </li>
        </ol>
      </Section>

      <Section id="rosters" title="2. Rosters from Google Classroom">
        <p>
          The email lists come straight from the band Google Classrooms. Save the class&apos;s People
          page and upload it; the portal pulls out the student emails for you.
        </p>
        <ol>
          <li>
            Open the Classroom in Chrome and click the <strong>People</strong> tab. Do a full page
            reload there (<kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>R</kbd>) so the save contains only this
            class.
          </li>
          <li>
            Press <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>S</kbd>. Format: <strong>Webpage, Complete</strong>.
            Save it anywhere; you only need the <code>.html</code> file, not the folder next to it.
          </li>
          <li>
            Repeat for the other class: one save for <strong>Jazz Band</strong>, one for{" "}
            <strong>Concert Band / Wind Ensemble / Marching Band</strong>.
          </li>
          <li>
            In the portal: user menu → <em>Roster</em> → <em>Import from Google Classroom</em>. Pick
            the file, pick the matching group, click <em>Preview</em>, check the class name and count
            it detected, then <em>Import</em>.
          </li>
        </ol>
        <p>Good to know:</p>
        <ul>
          <li>Only <strong>students</strong> are imported. Teachers are skipped automatically.</li>
          <li>
            A student in both classes ends up in both groups and is emailed <strong>once</strong>,
            even for an &ldquo;Everyone&rdquo; announcement.
          </li>
          <li>
            You won&apos;t see yourself in your own Classmates list — that&apos;s normal. Drum majors
            and admins get every email anyway, and are never emailed twice.
          </li>
          <li>
            Leave <em>&ldquo;Remove people who aren&apos;t in this file&rdquo;</em> checked when
            importing a fresh year&apos;s roster; it drops last year&apos;s students from that group.
          </li>
          <li>
            If the preview shows the wrong class name or a very different count, you probably saved
            while another class was still loaded. Reload the People page and save again.
          </li>
        </ul>
      </Section>

      <Section id="clear" title="3. Clearing last year's roster">
        <p>
          User menu → <em>Roster</em> → <em>Clear entire roster</em>, then type <code>CLEAR</code> to
          confirm. This removes every contact and their group memberships. Sent announcements and
          their open counts are kept. Use <em>Remove all members</em> on a single group when you only
          want to reset one class.
        </p>
      </Section>

      <Section id="people" title="4. Adding and removing drum majors">
        <ul>
          <li>
            <strong>Add:</strong> user menu → <em>Invites</em> → enter their school email and role.
            They get an email with a link that expires; re-send if it lapses.
          </li>
          <li>
            <strong>Remove:</strong> admins go to <em>Members</em>, open the person, and delete or
            change their role. Do this for everyone who graduated.
          </li>
          <li>
            <strong>Librarian</strong> is a limited role for someone who only manages sheet music.
          </li>
          <li>
            Lost a device? <em>Settings</em> → <em>Log out other devices</em>.
          </li>
        </ul>
      </Section>

      <Section id="announce" title="5. Sending announcements">
        <ul>
          <li>
            <em>Email Announcements</em> → <strong>New announcement</strong>. Choose who it&apos;s for
            (Jazz Band, Concert/Marching Band, or Everyone), write the subject and message, and
            send now, schedule, or save a draft.
          </li>
          <li>
            Type <code>@</code> in the message to mention a piece of music from the Library. It is
            attached to the email automatically as a Drive link.
          </li>
          <li>
            <strong>From template</strong> starts from a saved message. Edit templates there too.
          </li>
          <li>Drafts and scheduled sends live on the announcements page until they go out.</li>
        </ul>
      </Section>

      <Section id="music" title="6. Adding music">
        <ul>
          <li>
            <em>Library</em> → <strong>Add music</strong>. Pick the category (Concert Band, Jazz Band,
            Marching Band, Orchestra, …), type the title and the arranger or composer, and upload the
            part PDFs.
          </li>
          <li>
            For each PDF, tick the parts it contains. The portal names the file for you, in concert
            order, e.g. <code>Title - Flute 1 to Clarinet 2.pdf</code>.
          </li>
          <li>
            Everything is stored in the shared Google Drive folder <strong>Band Music Database</strong>,
            under the category folder, in a folder named <code>Title - arr. Name</code>. The folder is
            view-only for students; make changes in the portal, not in Drive.
          </li>
          <li>
            <code>index.csv</code> at the top of that Drive folder is regenerated automatically.
          </li>
        </ul>
      </Section>

      <Section id="handoff" title="7. Handoff notes">
        <p>
          User menu → <em>Handoff</em>. Write what worked, what didn&apos;t, and tips for the next
          class. Do it during the year, not the week before graduation.
        </p>
      </Section>
    </div>
  );
}
