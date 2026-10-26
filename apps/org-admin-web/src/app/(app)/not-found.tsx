import { NotFoundPanel } from "@sportspulse/ui";

// notFound() from a console page: the shell stays, the body says why.
export default function NotFound() {
  return <NotFoundPanel homeHref="/" />;
}
