# Roteiro de teste — Parte 2

Abra [http://localhost:3000](http://localhost:3000). Todas as contas de demonstração começam com `Caminho@2026!`; senhas alteradas anteriormente são preservadas.

## 1. Alunos e isolamento

1. Entre como **Gestão da escola** e abra **Cadastros e vínculos → Alunos**. Sofia deve estar disponível. Abra seu detalhe e confira os responsáveis.
2. Entre como **Responsável**, mantendo o contexto familiar de Ana, e abra **Meus filhos**. Sofia deve aparecer; Lucas e a Sofia da Escola Ipê não devem aparecer.
3. Entre como **Outra escola** e confira seu próprio cadastro, separado da Horizonte. Conhecer o ID de uma criança de outra organização não deve liberar seu detalhe.

## 2. Solicitação iniciada pelo transporte

1. Como escola Horizonte, abra **Solicitações**. Localize Lucas Ferreira com **Aguardando aceite**.
2. Antes do aceite, Lucas não deve aparecer na lista de alunos da escola nem ter detalhe acessível por ID.
3. Aceite o vínculo e volte a Alunos. Lucas passa a aparecer. Se recusar em vez de aceitar, o transporte pode reenviar usando o mesmo cadastro.

## 3. Solicitação iniciada pela escola

1. Na escola, cadastre um aluno fictício novo em **Novo aluno**.
2. Em **Solicitações**, selecione esse aluno e Transporte Boa Viagem, confirmando nome e código do destinatário. Envie o pedido.
3. Entre como **Motorista**. O pedido aparece em Solicitações, mas o aluno ainda não aparece em Alunos.
4. Aceite. Agora as duas organizações consultam o aluno. Quem iniciou não consegue aceitar o próprio pedido pela mesma organização.
5. Inative com um motivo de pelo menos 10 caracteres. O destinatário perde acesso ao detalhe; o detentor conserva o cadastro. A solicitação e o histórico permanecem.

## 4. Convite e verificação do responsável

1. No contexto que criou o aluno, abra seu detalhe e convide um e-mail fictício novo.
2. O link aparece no terminal da API, com aviso de entrega local. Nenhum e-mail real é enviado. Caso precise acompanhar os links, mantenha `npm run dev` em um terminal visível.
3. Abra o link em janela privada, informe nome e senha de 12+ caracteres e conclua o aceite. Contas já existentes precisam usar a senha atual.
4. Entre nessa conta nova. O estado de verificação aparece, mas nenhuma criança é liberada ainda.
5. Volte ao cadastro pelo emissor do convite. Registre como conferiu o vínculo no campo de verificação e clique **Verificar vínculo**.
6. Reabra/atualize Meus filhos na conta nova. Somente a criança convidada aparece.
7. Inative esse vínculo com motivo. A conta perde acesso à criança, sem apagar dados nem afetar os outros responsáveis.
8. Reutilizar o link consumido, cancelado ou expirado deve falhar. O aceite de novo convite exige nova verificação; não reativa acesso familiar sozinho.

## 5. Duplicidade

1. Na Horizonte, tente cadastrar novamente Sofia Menezes, inclusive variando acentos ou espaços. O sistema deve pedir revisão.
2. Confira o cadastro existente. Para representar uma homônima realmente distinta, marque a revisão e informe justificativa. Um segundo registro independente é criado, sem união automática.
3. A busca não expõe alunos de outra escola para comparação.

## 6. Organizações, motoristas e veículos

1. Como motorista, cadastre um veículo com placa brasileira e capacidade de 1 a 60 passageiros. A mesma placa não pode ser duplicada na mesma operação. Inativar/reativar preserva o registro.
2. A escola consulta veículos apenas de transportes com associação ativa. Ela não pode cadastrar/inativar veículos do transporte.
3. Em Motoristas, convide um e-mail de teste e descreva a conferência do vínculo profissional. Após o aceite, a conta fica vinculada somente à operação emissora.
4. Em Organizações, crie outra escola/operação. Selecione o novo contexto pela Visão geral. Ele deve começar sem alunos; não ocorre transferência automática.

## 7. Aplicativo

Siga o README para configurar o IP da API e executar `npm run dev:mobile`.

- Motorista: abra Cadastros, crie aluno, solicite/aceite/recuse vínculos, confira responsáveis e veículos.
- Responsável: abra Filhos e confira acesso somente após verificação. O botão Atualizar cadastros busca o estado atual do servidor.
- Para aceitar convite no app, use Tenho um convite e cole o valor de `token=` do link exibido pelo terminal.

**Pare ao concluir estes testes e informe ajustes ou autorize a Parte 3.** Não há viagens, confirmação de movimentações, rotina semanal ou alertas nesta etapa.
