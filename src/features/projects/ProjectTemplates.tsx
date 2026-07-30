import { useState } from "react";
import { I } from "@/components/primitives";
import { useScreen } from "@/store/screen";
import { useProjectsStore } from "./useProjectsStore";
import { PROJECT_TEMPLATES } from "@/lib/templates/project-templates";

export function ProjectTemplates() {
  const createProject = useProjectsStore((s) => s.createProject);
  const openProject = useProjectsStore((s) => s.openProject);
  const go = useScreen((s) => s.go);
  const [busyTemplate, setBusyTemplate] = useState<string | null>(null);

  const handlePick = async (templateId: string, label: string) => {
    if (busyTemplate) return;
    setBusyTemplate(templateId);
    try {
      const project = await createProject(label, templateId);
      if (project) {
        await openProject(project.id);
        if (useProjectsStore.getState().active?.id === project.id) go("editor", project.id);
      }
    } finally {
      setBusyTemplate(null);
    }
  };

  return (
    <section aria-label="Start fresh">
      <div className="od-template-heading">
        <div>Start fresh</div>
        <span>Templates</span>
      </div>
      <div className="od-template-list">
        {PROJECT_TEMPLATES.map((template) => {
          const busy = busyTemplate === template.id;
          const disabled = busyTemplate !== null && !busy;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => void handlePick(template.id, template.name)}
              disabled={disabled}
              aria-busy={busy}
              aria-label={`Start a new ${template.name} project`}
              title={template.description}
              className="od-template-card"
            >
              <div className="od-template-paper" aria-hidden="true">
                <span>TeX</span>
              </div>
              <div className="od-template-copy">
                <div>{template.name}</div>
                <span>{template.description}</span>
              </div>
              {busy ? (
                <span className="od-template-status">Creating...</span>
              ) : (
                <I.arrowR size={12} style={{ color: "var(--od-muted)" }} />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
