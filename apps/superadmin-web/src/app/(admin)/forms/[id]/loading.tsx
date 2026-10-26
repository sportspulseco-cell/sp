import { PageHeaderSkeleton, TableSkeleton } from "@sportspulse/ui";

/**
 * Shown the moment the editor is opened, while its server render runs
 * (CONSOLE-23): the navigation from "New form" commits at once instead
 * of waiting on the list for every API read the editor makes.
 */
export default function FormEditorLoading() {
  return (
    <div role="status" aria-label="Opening the form" className="space-y-8">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} cols={3} />
      <span className="sr-only">Opening the form</span>
    </div>
  );
}
