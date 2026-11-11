import {
  ActionConflictError,
  type ActionContext,
} from "../services/ActionContext";

/**
 * Identify the result of add() without assuming that the last slide remains last.
 * Office does not return a Slide from add(), or accept a client-generated ID.
 */
export async function createIdentifiedSlide(
  context: PowerPoint.RequestContext,
  result: string,
  action?: ActionContext,
  initialIds?: readonly string[],
  onDispatch?: () => void
): Promise<string> {
  action?.assertCurrent();
  const slides = context.presentation.slides;
  let before = initialIds;
  if (!before) {
    slides.load("items/id");
    await context.sync();
    action?.assertCurrent();
    before = slides.items.map((slide) => slide.id);
  }
  const previous = new Set(before);
  if (previous.size !== before.length || before.some((id) => !id))
    throw new ActionConflictError(result);

  action?.assertCurrent();
  slides.add();
  // Keep creation and its identity query together in the same host batch.
  slides.load("items/id");
  action?.assertCurrent();
  onDispatch?.();
  await context.sync();
  action?.assertCurrent();
  const after = slides.items.map((slide) => slide.id);
  const current = new Set(after);
  const added = after.filter((id) => !previous.has(id));
  if (
    after.some((id) => !id) ||
    current.size !== after.length ||
    before.some((id) => !current.has(id)) ||
    added.length !== 1
  ) {
    // Do not try to remove anything: another author may own the new slides.
    throw new ActionConflictError(result);
  }
  return added[0]!;
}
