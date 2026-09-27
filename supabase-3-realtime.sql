-- 실시간 동기화 켜기
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 한 번만 하면 됩니다.
-- 한 기기에서 고치면 다른 기기(아이폰·아이패드·노트북)에 바로 들어옵니다.

-- records 표의 변경을 실시간으로 알리도록 합니다.
alter publication supabase_realtime add table public.records;

-- 어떤 줄이 바뀌었는지 알리려면 기본키가 필요합니다. (이미 있으면 그대로 둡니다)
alter table public.records replica identity default;

-- 확인: 아래를 실행했을 때 records 가 보이면 켜진 것입니다.
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime';
