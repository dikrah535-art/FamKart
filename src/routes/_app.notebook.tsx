import { createFileRoute } from "@tanstack/react-router";
import { FamilyNotebook } from "@/components/notebook/FamilyNotebook";

export const Route = createFileRoute("/_app/notebook")({ component: NotebookHome });

function NotebookHome() {
  return <FamilyNotebook />;
}
