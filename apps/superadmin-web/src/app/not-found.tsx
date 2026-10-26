import { NotFoundPanel } from "@sportspulse/ui";

// Unknown URL, outside the console shell.
export default function NotFound() {
  return <NotFoundPanel fullScreen homeHref="/dashboard" />;
}
