import { getFileExtension } from "../../services/path-utils";
import type { FileNode, Project, ProjectFolder } from "@/domain";
import {
  SAMPLE_BIB,
  SAMPLE_MAIN_TEX,
  SAMPLE_PREAMBLE,
  SAMPLE_PROOF_TEX,
  SAMPLE_README,
  SAMPLE_INTRO_TEX,
  SAMPLE_SETUP_TEX,
  SAMPLE_FORMS_TEX,
  SAMPLE_APPLICATIONS_TEX,
  SAMPLE_ADVANCED_TEX,
} from "./sample-tex";

// Representative multi-file project kept exclusively as a test fixture.

const file = (
  id: string,
  path: string,
  content: string,
  extras: Partial<FileNode> = {},
): FileNode => {
  const name = path.split("/").pop() ?? path;
  const ext = getFileExtension(name);
  const kind: FileNode["kind"] =
    ext === "tex"
      ? "tex"
      : ext === "bib"
        ? "bib"
        : ext === "sty"
          ? "sty"
          : ext === "yml" || ext === "yaml"
            ? "yml"
            : ext === "md"
              ? "md"
              : ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "svg"
                ? "img"
                : ext === "txt"
                  ? "txt"
                  : "other";
  return { id, path, name, kind, content, ...extras };
};

const folder = (path: string, name: string, expanded = false): ProjectFolder => ({
  path,
  name,
  expanded,
});

export function makeStokesNotes(): Project {
  const files: FileNode[] = [
    file("f-main", "main.tex", SAMPLE_MAIN_TEX),
    file("f-intro", "chapters/intro.tex", SAMPLE_INTRO_TEX),
    file("f-setup", "chapters/setup.tex", SAMPLE_SETUP_TEX),
    file("f-forms", "chapters/forms.tex", SAMPLE_FORMS_TEX),
    file("f-proof", "chapters/proof.tex", SAMPLE_PROOF_TEX, { modified: true }),
    file("f-apps", "chapters/applications.tex", SAMPLE_APPLICATIONS_TEX),
    file("f-advanced", "chapters/advanced.tex", SAMPLE_ADVANCED_TEX),
    file("f-bib", "references.bib", SAMPLE_BIB),
    file("f-preamble", "preamble.sty", SAMPLE_PREAMBLE),
    file("f-readme", "README.md", SAMPLE_README),
  ];
  const folders: ProjectFolder[] = [
    folder("chapters", "chapters", true),
    folder("figures", "figures"),
    folder("references", "references"),
  ];

  return {
    id: "p-stokes-notes-v3",
    name: "Stokes Notes",
    entry: "main.tex",
    files: Object.fromEntries(files.map((f) => [f.path, f])),
    folders: Object.fromEntries(folders.map((f) => [f.path, f])),
    createdAt: new Date().toISOString(),
  };
}

/** Shared fixture for unit and integration tests. */
export const MOCK_PROJECT: Project = makeStokesNotes();
