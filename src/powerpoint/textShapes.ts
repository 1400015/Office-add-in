import type { ActionContext } from "../services/ActionContext";

// These shape types may contain editable text in PowerPointApi 1.4. Groups,
// tables, charts and pictures need different APIs and must not be probed via
// textFrame. A placeholder can still contain a picture, so isolate each probe.
const TEXT_SHAPE_TYPES = new Set([
  "TextBox",
  "GeometricShape",
  "Callout",
  "Freeform",
  "Placeholder",
]);

/** Load only supported text shapes, keeping their IDs for conflict detection. */
export async function loadTextShapes(
  context: PowerPoint.RequestContext,
  collection: PowerPoint.ShapeCollection,
  action?: ActionContext
): Promise<PowerPoint.Shape[]> {
  action?.assertCurrent();
  collection.load("items/id,items/type");
  await context.sync();
  action?.assertCurrent();
  const result: PowerPoint.Shape[] = [];
  for (const shape of collection.items) {
    if (!TEXT_SHAPE_TYPES.has(shape.type)) continue;
    action?.assertCurrent();
    try {
      shape.load("textFrame/textRange/text");
      await context.sync();
      action?.assertCurrent();
      result.push(shape);
    } catch (error) {
      action?.assertCurrent();
      // Non-text placeholders raise InvalidArgument at sync, rather than
      // returning a nullable text frame. Do not hide other host failures.
      if ((error as { code?: unknown } | null)?.code !== "InvalidArgument")
        throw error;
    }
  }
  return result;
}
