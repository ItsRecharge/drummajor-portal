import { AnnouncementStatus } from "@/generated/prisma/client";

// Human labels for the announcement lifecycle states.
export function statusLabel(status: AnnouncementStatus): string {
  switch (status) {
    case AnnouncementStatus.DRAFT:
      return "Draft";
    case AnnouncementStatus.SCHEDULED:
      return "Scheduled";
    case AnnouncementStatus.PENDING_APPROVAL:
      return "Pending approval";
    case AnnouncementStatus.SENDING:
      return "Sending";
    case AnnouncementStatus.SENT:
      return "Sent";
    case AnnouncementStatus.FAILED:
      return "Failed";
    default:
      return status;
  }
}
