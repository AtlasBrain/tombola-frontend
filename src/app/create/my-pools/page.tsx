// /create/my-pools used to be the standalone creator listing. /create now
// hosts that dashboard directly (with the new-pool form behind a modal), so
// /create/my-pools is consolidated away — visitors get redirected. The
// per-pool admin route at /create/my-pools/[pubkey] is unaffected.

import { redirect } from "next/navigation";

export default function MyPoolsListingRedirect(): never {
  redirect("/create");
}
