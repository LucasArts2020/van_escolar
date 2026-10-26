# Roteiro manual — Parte 1

1. Abra `http://localhost:3000`, escolha **Gestão da escola** e entre. Confira Escola Horizonte e a equipe.
2. Em **Meu perfil**, altere o nome, salve e atualize a página. O nome deve persistir.
3. Em **Equipe e permissões**, conceda coordenação a Pedro. Entre com `operacao@demo.local`: ele tem coordenação, mas não gestão de equipe.
4. Inative Pedro pela conta de gestão. Mesmo que ele já esteja conectado, chamadas ao contexto inativado devem ser recusadas. Reative pelo gestor para continuar o teste.
5. Convide um e-mail fictício novo. Copie do terminal da API o link marcado como entrega local. Abra em uma janela privada, complete nome e senha (12+ caracteres) e entre. A pessoa terá somente operação na Escola Horizonte. Reutilizar o convite deve falhar.
6. Entre com **Outra escola**. A equipe da Escola Horizonte não deve aparecer. Com a conta da Horizonte, enviar `X-Context-Id` de um vínculo da Escola Ipê deve retornar 403. Alterar membro de outra escola deve retornar 404.
7. Entre como responsável. No seletor **Contexto atual**, alterne entre família e vínculo escolar de operação. Cada seleção deve mostrar seu contexto, sem gestão de equipe. Motorista não tem acesso à equipe da escola.
8. Saia e use **Esqueci minha senha** com uma conta demo. Abra o link impresso no terminal, defina nova senha e tente reutilizar o link: deve falhar. Sessões anteriores devem deixar de funcionar na próxima requisição.
9. No celular, configure o IP da API e execute Expo. Teste motorista, responsável, restauração de sessão ao reabrir, troca de contexto, perfil e saída. O aplicativo deve apresentar início conforme o perfil escolhido.
10. Confira no histórico da escola a autoria das alterações e dos convites. Testes automatizados também verificam auditoria de sessão, perfil e recuperação.

Anote o que precisa ajustar. **Não avançar à Parte 2 até o retorno do usuário.**
