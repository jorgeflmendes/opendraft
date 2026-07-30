import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Project, FileKind } from "@/domain";
import { FileTree } from "./FileTree";

function file(path: string, kind: FileKind, content = "", modified = false) {
  return {
    id: path,
    path,
    name: path.split("/").at(-1) ?? path,
    kind,
    content,
    modified,
  };
}

function project(): Project {
  return {
    id: "p-tree",
    name: "Tree Project",
    entry: "main.tex",
    createdAt: "2026-05-23T00:00:00.000Z",
    folders: {
      chapters: { path: "chapters", name: "chapters", expanded: true },
      figures: { path: "figures", name: "figures", expanded: false },
    },
    files: {
      "main.tex": file("main.tex", "tex", "\\documentclass{}", true),
      "references.bib": file("references.bib", "bib"),
      README: file("README", "other"),
      "chapters/intro.tex": file("chapters/intro.tex", "tex"),
      "figures/logo.png": file("figures/logo.png", "img"),
    },
  };
}

describe("<FileTree />", () => {
  it("renders files, active state, modified badges, and opens clicked files", async () => {
    const user = userEvent.setup();
    const onOpenFile = vi.fn();
    render(<FileTree project={project()} activePath="main.tex" onOpenFile={onOpenFile} />);

    const main = screen.getByRole("button", { name: /main\.tex m/i });
    expect(main).toHaveAttribute("aria-current", "page");
    expect(screen.getByTitle("Modified")).toHaveTextContent("M");
    expect(screen.getByRole("button", { name: /^references\.bib$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^readme$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /actions for/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: /^chapters$/i }));
    expect(screen.queryByRole("button", { name: /^intro\.tex$/i })).toBeNull();

    await user.click(main);
    expect(onOpenFile).toHaveBeenCalledWith("main.tex");
  });

  it("toggles collapsed folders and reveals hidden children", async () => {
    const user = userEvent.setup();
    render(<FileTree project={project()} activePath={null} onOpenFile={() => {}} />);

    expect(screen.queryByRole("button", { name: /^logo\.png$/i })).toBeNull();

    const folder = screen.getByRole("button", { name: /^figures$/i });
    expect(folder).toHaveAttribute("aria-expanded", "false");

    await user.click(folder);
    expect(folder).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^logo\.png$/i })).toBeInTheDocument();
  });

  it("renames a file and closes the inline editor after a successful commit", async () => {
    const user = userEvent.setup();
    const onRenameFile = vi.fn().mockResolvedValue(true);
    render(
      <FileTree
        project={project()}
        activePath={null}
        onOpenFile={() => {}}
        onRenameFile={onRenameFile}
      />,
    );

    await user.click(screen.getByRole("button", { name: /actions for main\.tex/i }));
    await user.click(screen.getByRole("menuitem", { name: /rename/i }));

    const input = screen.getByLabelText(/rename main\.tex/i);
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, "entry.tex{Enter}");

    await waitFor(() => {
      expect(onRenameFile).toHaveBeenCalledWith("main.tex", "entry.tex");
      expect(screen.queryByLabelText(/rename main\.tex/i)).toBeNull();
    });
  });

  it("keeps the inline editor open when rename fails", async () => {
    const user = userEvent.setup();
    const onRenameFile = vi.fn().mockResolvedValue(false);
    render(
      <FileTree
        project={project()}
        activePath={null}
        onOpenFile={() => {}}
        onRenameFile={onRenameFile}
      />,
    );

    await user.click(screen.getByRole("button", { name: /actions for main\.tex/i }));
    await user.click(screen.getByRole("menuitem", { name: /rename/i }));
    const input = screen.getByLabelText(/rename main\.tex/i);
    await user.clear(input);
    await user.type(input, "entry.tex{Enter}");

    await waitFor(() => expect(onRenameFile).toHaveBeenCalledOnce());
    expect(screen.getByLabelText(/rename main\.tex/i)).toBeInTheDocument();
  });

  it("closes rename without calling the callback when the trimmed path is unchanged", async () => {
    const user = userEvent.setup();
    const onRenameFile = vi.fn();
    render(
      <FileTree
        project={project()}
        activePath={null}
        onOpenFile={() => {}}
        onRenameFile={onRenameFile}
      />,
    );

    await user.click(screen.getByRole("button", { name: /actions for main\.tex/i }));
    await user.click(screen.getByRole("menuitem", { name: /rename/i }));
    await user.keyboard("{Enter}");

    expect(onRenameFile).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/rename main\.tex/i)).toBeNull();
  });

  it("cancels rename with Escape", async () => {
    const user = userEvent.setup();
    const onRenameFile = vi.fn();
    render(
      <FileTree
        project={project()}
        activePath={null}
        onOpenFile={() => {}}
        onRenameFile={onRenameFile}
      />,
    );

    await user.click(screen.getByRole("button", { name: /actions for main\.tex/i }));
    await user.click(screen.getByRole("menuitem", { name: /rename/i }));
    await user.keyboard("{Escape}");

    expect(onRenameFile).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/rename main\.tex/i)).toBeNull();
  });

  it("requires two clicks before deleting a file", async () => {
    const user = userEvent.setup();
    const onDeleteFile = vi.fn().mockResolvedValue(true);
    render(
      <FileTree
        project={project()}
        activePath={null}
        onOpenFile={() => {}}
        onDeleteFile={onDeleteFile}
      />,
    );

    await user.click(screen.getByRole("button", { name: /actions for main\.tex/i }));
    await user.click(screen.getByRole("menuitem", { name: /^delete$/i }));
    expect(onDeleteFile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("menuitem", { name: /click again to delete/i }));
    expect(onDeleteFile).toHaveBeenCalledWith("main.tex");
  });

  it("closes the actions menu on an outside pointer event", async () => {
    const user = userEvent.setup();
    render(
      <FileTree
        project={project()}
        activePath={null}
        onOpenFile={() => {}}
        onRenameFile={() => true}
        onDeleteFile={() => true}
      />,
    );

    await user.click(screen.getByRole("button", { name: /actions for main\.tex/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("handles custom right-click context menu and preventDefault on it", async () => {
    const user = userEvent.setup();
    const onContextMenuExt = vi.fn();
    render(
      <FileTree
        project={project()}
        activePath="main.tex"
        onOpenFile={() => {}}
        onRenameFile={() => true}
        onDeleteFile={() => true}
        onContextMenu={onContextMenuExt}
      />,
    );

    const mainRow = screen.getByRole("button", { name: /main.tex m/i });

    fireEvent.contextMenu(mainRow, { clientX: 100, clientY: 200 });

    const renameOption = await screen.findByRole("menuitem", { name: /rename/i });
    expect(renameOption).toBeInTheDocument();

    const menuContainer =
      renameOption.closest("div[style*='position: fixed']") || renameOption.parentElement;
    fireEvent.contextMenu(menuContainer!); // Hits the e.preventDefault() line
    fireEvent.mouseDown(menuContainer!); // Hits the e.stopPropagation() line

    await user.click(renameOption);
    expect(screen.getByLabelText(/rename main.tex/i)).toBeInTheDocument();
  });

  it("handles custom right-click context menu delete option", async () => {
    const user = userEvent.setup();
    const onDeleteFile = vi.fn().mockResolvedValue(true);
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => false);

    render(
      <FileTree
        project={project()}
        activePath="main.tex"
        onOpenFile={() => {}}
        onRenameFile={() => true}
        onDeleteFile={onDeleteFile}
      />,
    );

    const mainRow = screen.getByRole("button", { name: /main.tex m/i });

    fireEvent.contextMenu(mainRow, { clientX: 100, clientY: 200 });

    const deleteOption = await screen.findByRole("menuitem", { name: /^delete$/i });

    await user.click(deleteOption);

    expect(confirmSpy).toHaveBeenCalledWith("Are you sure you want to delete main.tex?");
    expect(onDeleteFile).not.toHaveBeenCalled(); // cancelled

    confirmSpy.mockRestore();
  });

  it("closes action context menu by pressing Enter on rename and delete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(true);
    const onRename = vi.fn().mockResolvedValue(true);
    render(
      <FileTree
        project={project()}
        activePath={null}
        onOpenFile={() => {}}
        onRenameFile={onRename}
        onDeleteFile={onDelete}
      />,
    );

    await user.click(screen.getByRole("button", { name: /actions for main.tex/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    const renameItem = screen.getByRole("menuitem", { name: /rename/i });
    renameItem.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByLabelText(/rename main.tex/i)).toBeInTheDocument();

    await user.keyboard("{Escape}");

    const actionBtn = screen.getByRole("button", { name: /actions for main.tex/i });
    actionBtn.focus();
    await user.keyboard(" ");
    expect(screen.getByRole("menu")).toBeInTheDocument();

    const deleteItem = screen.getByRole("menuitem", { name: /^delete$/i });
    deleteItem.focus();
    await user.keyboard(" ");

    const confirmItem = screen.getByRole("menuitem", { name: /click again to delete/i });
    expect(confirmItem).toBeInTheDocument();
    confirmItem.focus();
    await user.keyboard("{Enter}");

    expect(onDelete).toHaveBeenCalledWith("main.tex");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders trash list if there are deleted files and handles restore", async () => {
    const user = userEvent.setup();
    const p = project();
    p.files["deleted.tex"] = file("deleted.tex", "tex", "", false);
    p.files["deleted.tex"].deletedAt = "2026-05-23T01:00:00.000Z";

    const onRestoreFile = vi.fn();
    render(
      <FileTree
        project={p}
        activePath={null}
        onOpenFile={() => {}}
        onRestoreFile={onRestoreFile}
      />,
    );

    const trashToggle = screen.getByRole("button", { name: /^Trash$/i });
    await user.click(trashToggle);

    const deletedItem = screen.getByText("deleted.tex");
    expect(deletedItem).toBeInTheDocument();

    const restoreBtn = screen.getByRole("button", { name: /Restore deleted.tex/i });
    await user.click(restoreBtn);

    expect(onRestoreFile).toHaveBeenCalledWith("deleted.tex");
  });

  it("handles keyboard navigation on tree items (folders)", async () => {
    const user = userEvent.setup();
    render(<FileTree project={project()} activePath={null} onOpenFile={() => {}} />);

    const folder = screen.getByRole("button", { name: /^figures$/i });
    folder.focus();

    await user.keyboard("{Enter}");
    expect(folder).toHaveAttribute("aria-expanded", "true");

    await user.keyboard(" ");
    expect(folder).toHaveAttribute("aria-expanded", "false");
  });

  it("handles keyboard navigation on tree items (files)", async () => {
    const user = userEvent.setup();
    const onOpenFile = vi.fn();
    render(<FileTree project={project()} activePath={null} onOpenFile={onOpenFile} />);

    const fileItem = screen.getByRole("button", { name: /^readme$/i });
    fileItem.focus();

    await user.keyboard("{Enter}");
    expect(onOpenFile).toHaveBeenCalledWith("README");

    await user.keyboard(" ");
    expect(onOpenFile).toHaveBeenCalledWith("README");
  });

  it("handles Context menu item rename and delete with Enter and Space", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onRename = vi.fn();
    render(
      <FileTree
        project={project()}
        activePath={null}
        onOpenFile={() => {}}
        onDeleteFile={onDelete}
        onRenameFile={onRename}
      />,
    );

    const mainRow = screen.getByRole("button", { name: /main.tex m/i });
    fireEvent.contextMenu(mainRow, { clientX: 100, clientY: 200 });

    const renameMenuItem = screen.getByRole("menuitem", { name: /rename/i });
    renameMenuItem.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText(/rename main\.tex/i)).toBeInTheDocument();
  });

  it("deletes a file from the custom context menu", async () => {
    const user = userEvent.setup();
    const onDeleteFile = vi.fn(() => true);
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);

    render(
      <FileTree
        project={project()}
        activePath="main.tex"
        onOpenFile={() => {}}
        onRenameFile={() => true}
        onDeleteFile={onDeleteFile}
        onContextMenu={() => {}}
      />,
    );

    const mainRow = screen.getByRole("button", { name: /main.tex m/i });

    fireEvent.contextMenu(mainRow, { clientX: 100, clientY: 200 });

    const deleteOption = await screen.findByRole("menuitem", { name: /delete/i });
    await user.click(deleteOption);

    expect(confirmSpy).toHaveBeenCalledWith("Are you sure you want to delete main.tex?");
    expect(onDeleteFile).toHaveBeenCalledWith("main.tex");

    confirmSpy.mockRestore();
  });

  it("triggers onContextMenu on folders too", async () => {
    const onContextMenu = vi.fn();
    render(
      <FileTree
        project={project()}
        activePath="main.tex"
        onOpenFile={() => {}}
        onContextMenu={onContextMenu}
      />,
    );

    const folderRow = screen.getByRole("button", { name: /^chapters$/i });
    fireEvent.contextMenu(folderRow, { clientX: 100, clientY: 200 });

    expect(onContextMenu).toHaveBeenCalled();
  });
});
