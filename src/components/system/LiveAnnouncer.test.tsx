/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveAnnouncer } from "./LiveAnnouncer";
import { useCompileStore } from "@/features/compile";
import { act } from "react";

describe("<LiveAnnouncer />", () => {
  beforeEach(() => {
    useCompileStore.setState({
      status: "idle",
      result: null,
      progress: null,
      synctex: null,
    } as never);
  });

  it("does not announce anything on initial render", () => {
    render(<LiveAnnouncer />);
    expect(screen.getByTestId("live-announcer")).toBeEmptyDOMElement();
  });

  it("announces when compile starts", () => {
    render(<LiveAnnouncer />);
    act(() => {
      useCompileStore.setState({ status: "compiling" } as never);
    });
    expect(screen.getByTestId("live-announcer")).toHaveTextContent("Compile started.");
  });

  it("announces successful compile", () => {
    render(<LiveAnnouncer />);
    act(() => {
      useCompileStore.setState({
        status: "success",
        result: { durationLabel: "1.5s" } as unknown as any,
      } as never);
    });
    expect(screen.getByTestId("live-announcer")).toHaveTextContent("Compile finished in 1.5s.");
  });

  it("announces warnings", () => {
    render(<LiveAnnouncer />);
    act(() => {
      useCompileStore.setState({
        status: "warning",
        result: {
          log: [
            { level: "warn", message: "First warning" },
            { level: "warn", message: "Second warning" },
            { level: "warn", message: "First warning" },
          ],
        } as unknown as any,
      } as never);
    });
    expect(screen.getByTestId("live-announcer")).toHaveTextContent(
      "Compile finished with 2 warnings.",
    );

    act(() => {
      useCompileStore.setState({
        status: "warning",
        result: { log: [{ level: "warn", message: "Warning" }] } as unknown as any,
      } as never);
    });
    expect(screen.getByTestId("live-announcer")).toHaveTextContent(
      "Compile finished with 1 warning.",
    );
  });

  it("announces errors", () => {
    render(<LiveAnnouncer />);
    act(() => {
      useCompileStore.setState({
        status: "error",
        result: {
          log: [
            { level: "error", message: "First error" },
            { level: "error", message: "Second error" },
            { level: "error", message: "First error" },
          ],
        } as unknown as any,
      } as never);
    });
    expect(screen.getByTestId("live-announcer")).toHaveTextContent("Compile failed with 2 errors.");

    act(() => {
      useCompileStore.setState({
        status: "error",
        result: { log: [{ level: "error", message: "Error" }] } as unknown as any,
      } as never);
    });
    expect(screen.getByTestId("live-announcer")).toHaveTextContent("Compile failed with 1 error.");
  });

  it("announces idle state (which returns null internally)", () => {
    render(<LiveAnnouncer />);
    act(() => {
      // Transition from idle -> compiling -> idle to see if it sets to null/unchanged
      useCompileStore.setState({ status: "compiling" } as never);
    });
    expect(screen.getByTestId("live-announcer")).toHaveTextContent("Compile started.");

    act(() => {
      useCompileStore.setState({ status: "idle" } as never);
    });
    // Idle state doesn't change the message because describe() returns null
    expect(screen.getByTestId("live-announcer")).toHaveTextContent("Compile started.");
  });

  it("announces success without duration", () => {
    render(<LiveAnnouncer />);
    act(() => {
      useCompileStore.setState({
        status: "success",
        result: { durationLabel: undefined } as unknown as any,
      } as never);
    });
    expect(screen.getByTestId("live-announcer")).toHaveTextContent("Compile finished.");
  });

  it("announces warning with undefined log", () => {
    render(<LiveAnnouncer />);
    act(() => {
      useCompileStore.setState({
        status: "warning",
        result: undefined as unknown as any,
      } as never);
    });
    expect(screen.getByTestId("live-announcer")).toHaveTextContent(
      "Compile finished with 0 warnings.",
    );
  });

  it("announces error with undefined log", () => {
    render(<LiveAnnouncer />);
    act(() => {
      useCompileStore.setState({
        status: "error",
        result: undefined as unknown as any,
      } as never);
    });
    expect(screen.getByTestId("live-announcer")).toHaveTextContent("Compile failed.");
  });
});
