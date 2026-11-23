-- De-duplicate question reports
--
-- Every question now has a one-tap Report control (during play and in results), so the same
-- player could file the same report on the same question many times. report_question now
-- returns quietly when this player already reported this question in this match for the same
-- reason. The app treats that as saved, which is true.
--
-- A function-level check instead of a unique index so existing duplicate rows don't block the
-- migration. The advisory lock serializes concurrent identical calls (double tap, two tabs).
-- The body below is 20261105000000_core's, plus the duplicate check. Grants carry over.

create or replace function public.report_question(p_match uuid, p_slot text, p_reason text)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare uid uuid := private.require_uid(); v_qid uuid; v_reason text := left(coalesce(p_reason, ''), 500);
begin
  perform private.player_row(p_match, uid);
  select question_id into v_qid from match_questions where match_id = p_match and slot = p_slot;
  if v_qid is null then raise exception 'invalid_slot'; end if;
  perform pg_advisory_xact_lock(hashtext('report_question:' || uid || ':' || p_match || ':' || v_qid));
  if exists (
    select 1 from reports
     where reporter_id = uid and match_id = p_match and kind = 'question'
       and question_id = v_qid and reason = v_reason
  ) then
    return;
  end if;
  insert into reports (reporter_id, match_id, kind, question_id, reason)
  values (uid, p_match, 'question', v_qid, v_reason);
end
$$;
