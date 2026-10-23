# Voragon — notificações do Instagram

Perfil: @vorpageljeff. Aplicativo: Voragon-IG.
Endpoint: https://voragon-instagram.vercel.app/api/instagram-webhook

A função valida o desafio GET da Meta e autentica notificações POST com HMAC-SHA256 sobre o corpo original. Somente contagens dos eventos da conta configurada são registradas nos logs da Vercel. Não armazena textos, anexos, remetentes ou conversas e não envia mensagens; não é uma caixa de entrada nem um atendente automático.

## Configuração

Variáveis de produção: INSTAGRAM_VERIFY_TOKEN, INSTAGRAM_APP_SECRET e INSTAGRAM_ACCOUNT_ID. As credenciais ficam fora deste projeto e não são servidas por HTTP. O token de acesso permanece somente na configuração local restrita, pois a função não precisa dele.

## Verificação

`npm test`: desafio correto/incorreto, assinatura inválida, corpo adulterado, JSON inválido, limite de tamanho e ausência de dados privados nos logs.

Verificado em produção: desafio 200, notificação sintética assinada 200, chamada sem assinatura 401. O callback foi verificado e salvo na Meta. O teste oficial messages v26.0 foi concluído com sucesso em 21/09/2026 às 17:08:49 (horário exibido pela Meta). A assinatura de @vorpageljeff foi ativada; o painel confirmou “Os webhooks ficaram on”. A publicação do app Voragon foi confirmada pela Meta em 21/09/2026: “Seu app foi publicado com sucesso”. Eventos de mensagens reais ainda não foram testados. Publicação não equivale à aprovação de acesso avançado a permissões.

## Páginas públicas e próxima verificação

Política de privacidade: https://voragon.vercel.app/privacidade
Instruções de exclusão de dados: https://voragon.vercel.app/exclusao-de-dados

Ambos os links foram publicados, verificados com HTTP 200 e salvos nas configurações básicas da Meta. O endereço genérico do Facebook foi removido do campo opcional de termos.

Próxima verificação: enviar voluntariamente uma mensagem de outra conta para @vorpageljeff e conferir a recepção do evento. Nenhum envio de mensagem ou resposta automática foi implementado.
