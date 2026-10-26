# Validação da central escolar — 26/10/2026

## Lógica e contratos

`npm test`: **138 testes aprovados, zero falhas e zero ignorados**. São os 130 anteriores e oito novas regressões em `apps/api/test/school-central.test.ts`.

Os testes novos conferem escola registrando primeiro na ida e na volta, resposta enriquecida do POST e replay sem duplicação, autoria individual e conflito entre funcionários do mesmo lado. Correção aprovada no embarque passa a gerar sequência incompleta no desembarque; datas históricas não liberam encerramento normal de ocorrência. Uma contabilização excepcional fica fora das entregas normais mesmo quando o desembarque original tinha duas confirmações.

O novo crítico de embarque na volta alcança coordenação própria e motorista, com cobrança somente para quem falta. Reavaliação de caso antigo funciona mesmo com a mesma lista de pessoas, mantendo origem/prazo e sem repetir avisos. Ausência/revogação de coordenação deixa encaminhamento incompleto e revoga acesso ao acompanhamento reservado à coordenação.

`npm run test:integration`, com PostgreSQL/Redis reais e ensaio de backup, aprovou **16 testes, zero falhas e zero ignorados**. A execução utilizou schema exclusivo `qa_part10_694ff062c05f4e71`; a restauração preservou as 32 tabelas e o conteúdo crítico. O encerramento removeu somente seu schema e prefixo de fila.

## Navegador com PostgreSQL/Redis reais

O Edge automatizado utilizou API temporária em `127.0.0.1:3002`, schema `qa_school_ac78ba0fc35e4984`, prefixo Redis exclusivo e dados fictícios. Chamadas do painel foram encaminhadas à API isolada; cadastros e viagens do usuário não foram usados.

Passaram:

- Entrada escolar diretamente na central; links de alerta/notificação continuam no destino autorizado.
- **60 crianças na ida em duas vans**, incluindo homônimos; pesquisa por nome/identificador e filtro por van.
- **60 POSTs individuais**, sem GET de detalhes por confirmação, sem HTTP 429 e sem erro JavaScript observado.
- Confirmação por teclado e por clique, botão/foco preservados, mesma ordem e posição das linhas.
- Resposta perdida depois de commit real: consulta identifica o único registro, sem novo POST ou duplicação.
- Resposta antiga de GET segurada antes da confirmação e liberada depois: não apaga a confirmação mais recente.
- Escola confirmando primeiro no recebimento da ida e no embarque da volta; motorista completa o outro lado posteriormente.
- Recebimento com embarque ausente mantém ocorrência de sequência incompleta.
- Vínculo inativado deixa de aparecer após atualização; reativação recupera acesso permitido. Outra escola consulta somente seus próprios alunos.
- Reinício da instância de worker com PostgreSQL/Redis reais, sem envio externo.
- Ensaio adicional da D-05 no PostgreSQL real: coordenação recebe acompanhamento `UPDATE`, motorista faltante recebe `ACTION`; repetir processamento não duplica avisos. Revogar coordenação oculta seu aviso reservado e sinaliza encaminhamento incompleto; restaurá-la mantém a origem e não repete notificações.
- **1440, 390 e 320 pixels**, sem overflow horizontal; botões de confirmação com pelo menos 44 pixels. Em 390×844, o primeiro botão fica inteiramente visível na abertura da central.

As capturas de desktop e celular foram inspecionadas. O cabeçalho móvel foi compactado para aproximar os botões, preservando identificação da criança, placa e motorista.

Ao encerrar, a API temporária removeu seu próprio schema e prefixo Redis. Uma consulta independente confirmou **zero schemas `qa_school_*` e zero chaves Redis desses prefixos**. A metadata registra `closed: true`; os dados do usuário permaneceram preservados.

## Compilação e limites

Verificação de tipos API/web/Expo aprovada. Exportação Android Expo aprovada: **708 módulos**, bundle Hermes de aproximadamente **1,9 MB**. Exportar não substitui instalação ou teste em aparelho físico.

`npm run build` aprovado para API NestJS e painel Next.js, incluindo a verificação de tipos final do painel.

Não há nova migração de banco nem confirmação em lote. Registros originais e resoluções existentes permanecem preservados. A simplificação completa dos layouts do motorista e do responsável continua para a próxima rodada.

Falta o teste interativo do usuário. Push externo continua desabilitado; nenhum e-mail real ou destinatário alternativo foi configurado. Esta entrega permanece para teste local, com uso real condicionado às pendências operacionais da Parte 10.

Relatórios e capturas estão em `.local/school-*`, ignorados pelo Git. O roteiro para o usuário está em `teste-central-escola.md`.
