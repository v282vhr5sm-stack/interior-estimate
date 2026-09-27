-- (선택) 실시간 동기화를 한 겹 더 튼튼하게
--
-- 안 하셔도 됩니다. 앱은 이미 기기끼리 서로 "바꿨다"고 알려주는 방식으로
-- 바로바로 맞춰집니다. 아래를 실행하면 서버가 직접 알려주는 길이 하나 더
-- 생겨서, 앱을 거치지 않고 데이터가 바뀐 경우에도 곧바로 반영됩니다.
--
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 한 번이면 끝입니다.

alter publication supabase_realtime add table public.records;
alter table public.records replica identity default;

-- 확인: 아래를 실행했을 때 records 가 보이면 켜진 것입니다.
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime';
