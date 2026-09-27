-- 카톡 링크 미리보기에 현장 이름이 나오게 하기
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run 한 번이면 끝입니다.
-- 돈은 들지 않고, 언제든 되돌릴 수 있습니다.
--
-- 하는 일: 내 계정 폴더 안에는 파일을 올리고 바꿀 수 있게 허용합니다.
--          (착공할 때 앱이 그 현장용 안내 파일을 하나 만들어 올립니다. 한 개 12KB 정도)

-- 1) plans 버킷이 특정 파일 종류만 받도록 잠겨 있으면 풀어줍니다
update storage.buckets set allowed_mime_types = null where id = 'plans';

-- 2) 내 폴더(맨 앞이 내 사용자 번호인 경로)에는 올리기·바꾸기·지우기 허용
drop policy if exists "plans own folder insert" on storage.objects;
create policy "plans own folder insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'plans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "plans own folder update" on storage.objects;
create policy "plans own folder update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'plans'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'plans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "plans own folder delete" on storage.objects;
create policy "plans own folder delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'plans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3) 링크를 받은 사람은 누구나 볼 수 있어야 하므로 읽기는 열어 둡니다
drop policy if exists "plans public read" on storage.objects;
create policy "plans public read" on storage.objects
  for select to public
  using ( bucket_id = 'plans' );

-- 4) 버킷이 공개로 되어 있는지 확인 (사진이 손님에게 보이려면 필요합니다)
update storage.buckets set public = true where id = 'plans';

-- 확인용 ─ 아래를 실행하면 방금 만든 규칙 4개가 보입니다.
-- select policyname from pg_policies where tablename='objects' and policyname like 'plans%';
