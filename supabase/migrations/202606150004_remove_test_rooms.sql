delete from public.secure_rooms
where host_name in ('Deploy Test', 'E2E Host', 'Lobby Host', 'Rate Test', 'Browser Test', 'Vendor Test')
   or title in ('公開テスト', '鍵付きテスト', '招待専用テスト');
