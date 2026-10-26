# Roteiro de teste — Parte 4

Atualize [http://localhost:3000](http://localhost:3000). Use as contas demo existentes; a senha inicial é `Caminho@2026!`. Senhas alteradas não são restauradas.

## 1. Preparar uma viagem

1. Entre como Motorista e abra **Viagens e passageiros**.
2. Escolha hoje e **Ida** ou **Volta**. Cada trecho tem suas próprias listas.
3. Clique **Preparar viagem**, selecione o motorista, a van e as crianças. O filtro de escola permite montar uma lista de uma ou mais escolas.
4. Se não houver previsões, use **Gerar previsões desta data**. Uma nova operação precisa configurar limite/fuso no Planejamento primeiro.
5. Selecione Sofia e salve. Seu planejamento original aparece no cartão. Uso confirmado entra como A transportar; sem resposta entra como Definir destinação; não uso expresso entra como Não transportada.
6. Confira que o mesmo trecho não pode entrar em outra viagem ativa e que a previsão está bloqueada para respostas comuns na Parte 3.

## 2. Destinação e ausência

1. Em um passageiro com Definir destinação, escreva um motivo de pelo menos dez caracteres. Escolha **Incluir para transporte** ou **Registrar ausência**.
2. Confira os totais e o motivo registrado. Sem resposta da família não deve virar ausência automaticamente.
3. Se marcou ausência por engano, abra Alterar destinação e inclua para transporte com novo motivo. Nenhum registro é removido.
4. Não é possível iniciar com passageiros ainda em revisão ou sem nenhum passageiro A transportar.
5. Trechos ainda sem viagem continuam listados para destinação, inclusive se houver outra viagem preparada.

## 3. Inclusão excepcional

1. Para um trecho sem previsão na rotina, selecione-o na preparação e preencha **Motivo das inclusões sem previsão**.
2. Outra opção é abrir uma viagem existente e **Inclusão excepcional de aluno**, selecionar um trecho ainda não reservado, registrar motivo e autorizar.
3. O aluno precisa ter cadastro, associação operacional ativa e previsão diária para a data/trecho. Gere-a no Planejamento se necessário.
4. Confira a identificação da inclusão autorizada pelo transporte e o planejamento original preservado. Essa ação não confirma uso em nome do responsável nem altera a rotina.
5. Um pedido de planejamento em análise deve ser decidido antes de incluir o trecho na viagem.

## 4. Início e substituições

1. Antes de iniciar, experimente substituir a van. Cadastre uma van reserva em **Cadastros e vínculos → Veículos**, se necessário. Use **Substituir motorista ou veículo**, escolha os novos recursos e registre motivo.
2. Abra **Histórico de motorista e veículo** e confira o registro inicial, a troca, o autor e o horário. O histórico anterior permanece.
3. Clique **Iniciar viagem**. Só o motorista designado pode iniciar na data correta, com recursos ativos e passageiros revisados.
4. O estado muda para Em andamento, mas o contador de embarques continua zero. Início não confirma movimentação.
5. Uma segunda viagem não pode iniciar com o mesmo motorista ou veículo enquanto a primeira estiver em andamento.
6. Não há botão de concluir/encerrar. A conferência final será implementada na Parte 8.

As viagens iniciadas permanecerão em andamento nesta etapa. Para repetir o teste sem iniciar, use outra data e cancele a viagem enquanto planejada.

## 5. Cancelamento e acesso

1. Em outra viagem ainda Planejada, abra **Cancelar viagem planejada**, informe motivo e cancele. A viagem e suas participações permanecem no histórico; o trecho pode ser reservado em nova viagem.
2. Uma viagem iniciada não pode ser cancelada. A proteção contra ausência após embarque informado foi verificada no banco de teste; embarques reais serão testados na Parte 5.
3. Entre como Escola e abra a mesma data/trecho. Veja somente seus alunos e os totais correspondentes, sem botões de preparar/iniciar/alterar.
4. Entre como Responsável. Apenas os filhos com vínculo familiar ativo aparecem. Outra escola sem associação não consulta a viagem por conhecer seu ID.
5. Alterações feitas por outro usuário aparecem com **Atualizar viagens**. Datas passadas são consulta.

## 6. Aplicativo

Use a configuração de IP/Expo do README. A aba **Viagens** oferece preparação, escolha de passageiros, destinação, início, inclusão, substituição e cancelamento planejado para o motorista. O responsável consulta seus filhos. A data é digitada como AAAA-MM-DD; ida e volta têm abas separadas. Use Atualizar viagens depois de mudanças externas. Ações sem resposta da API não são apresentadas como concluídas.
