import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { EvidencePhotoViewer } from "./EvidencePhotoViewer";
import type { VehiclePhoto } from "../types";

const mockRequest = jest.fn().mockResolvedValue({ imageUrl: "https://example.test/evidence.jpg" });
jest.mock("../workspace/WorkspaceContext", () => ({ useWorkspace: () => ({ request: mockRequest }) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
const photo = { id: "photo-one", declaredAngle: "front" } as VehiclePhoto;

it("bounds zoom, fits the evidence, and resets when changing photos", async () => {
  const onNext = jest.fn();
  const props = { photo, position: 0, total: 2, onNext, onPrevious: jest.fn(), onClose: jest.fn() };
  const view = await render(<EvidencePhotoViewer {...props} />);
  await waitFor(() => expect(view.getByLabelText("front evidence enlarged")).toBeTruthy());
  for (let index = 0; index < 8; index++) await fireEvent.press(view.getByLabelText("Zoom in"));
  expect(view.getByText("400% · drag to inspect")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Fit evidence photo"));
  expect(view.getByText("Fit to frame")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Next evidence photo"));
  expect(onNext).toHaveBeenCalledTimes(1);
  await fireEvent.press(view.getByLabelText("Zoom in"));
  await view.rerender(<EvidencePhotoViewer {...props} photo={{ ...photo, id: "photo-two", declaredAngle: "rear" }} position={1} />);
  expect(view.getByText("Fit to frame")).toBeTruthy();
});

it("labels a one-pixel image as unavailable, not as inspected evidence", async () => {
  const view = await render(<EvidencePhotoViewer photo={photo} position={0} total={1} onNext={jest.fn()} onPrevious={jest.fn()} onClose={jest.fn()} />);
  await waitFor(() => expect(view.getByLabelText("front evidence enlarged")).toBeTruthy());
  await fireEvent(view.getByLabelText("front evidence enlarged"), "load", { nativeEvent: { source: { width: 1, height: 1 } } });
  expect(view.getByText("Evidence preview unavailable")).toBeTruthy();
  expect(view.queryByLabelText("front evidence enlarged")).toBeNull();
});
