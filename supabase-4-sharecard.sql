-- 스토리지 권한 정리 (이미 실행하셨습니다)
--
-- 원래는 카톡 미리보기 카드에 현장 이름을 넣으려고 만든 것인데,
-- Supabase가 보안상 HTML 파일을 화면이 아니라 글자로만 내보내서
-- 그 방법은 쓸 수 없었습니다. 아래 규칙 자체는 사진·도면 올리기에
-- 필요한 정상 권한이라 그대로 두시면 됩니다.

update storage.buckets set allowed_mime_types = null where id = 'plans';
update storage.buckets set public = true where id = 'plans';

drop policy if exists "plans own folder insert" on storage.objects;
create policy "plans own folder insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'plans' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "plans own folder update" on storage.objects;
create policy "plans own folder update" on storage.objects
  for update to authenticated
  using (bucket_id = 'plans' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'plans' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "plans own folder delete" on storage.objects;
create policy "plans own folder delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'plans' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "plans public read" on storage.objects;
create policy "plans public read" on storage.objects
  for select to public using (bucket_id = 'plans');
