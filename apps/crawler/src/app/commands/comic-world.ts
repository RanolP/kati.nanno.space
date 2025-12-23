import { command, constant, map } from '@optique/core';
import ky from 'ky';
import * as v from 'valibot';

export const CommandComicWorld = map(
  command('cw', constant(void 0)),
  () => async () => {
    const response = await ky
      .post('https://comicw.co.kr/d/ajax.main.php', {
        body: new URLSearchParams({ type: 'comic' }),
      })
      .json();
    const events = v.parse(v.array(ComicWorldEventSchema), await response);
    console.log(events);
  },
);

const ComicWorldEventSchema = v.strictObject({
  title: v.string(),
  place: v.string(),
  tag: v.string(),
  status: v.literal('0'),
  boothStatus: v.number(),
  startDate: v.pipe(
    v.string(),
    v.regex<`${number}-${number}-${number}`>(/^\d{4}-\d{2}-\d{2}$/),
  ),
  endDate: v.pipe(
    v.string(),
    v.regex<`${number}-${number}-${number}`>(/^\d{4}-\d{2}-\d{2}$/),
  ),
  submitLink: v.string(),
  ticketLink: v.fallback(v.pipe(v.string(), v.nonEmpty()), null),
  baggageLink: v.fallback(v.pipe(v.string(), v.nonEmpty()), null),
  guideLink: v.fallback(v.pipe(v.string(), v.nonEmpty()), null),
  boothGuideLink: v.string(),
  stageLink: v.fallback(v.pipe(v.string(), v.nonEmpty()), null),
  boothMapLink: v.fallback(v.pipe(v.string(), v.nonEmpty()), null),
});
