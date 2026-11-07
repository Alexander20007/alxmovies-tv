-- OPCIONAL: apaga 4 funções antigas de um sistema de amigos anterior.
-- O site atual NÃO usa nenhuma delas (conferido) e elas apontam pra uma
-- tabela que não existe mais (social_privacy). Não atrapalham nada se
-- ficarem; só deixa o banco mais limpo.
drop function if exists public.search_social_profiles(text, uuid);
drop function if exists public.search_social_profiles(text);
drop function if exists public.get_social_friends(uuid);
drop function if exists public.get_social_profile(uuid, uuid);
notify pgrst, 'reload schema';
