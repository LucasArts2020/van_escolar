# Teste da central escolar

Abra http://localhost:3000 e entre como **Gestão da escola** (`escola@demo.local`) ou **Equipe** (`operacao@demo.local`). Senha inicial, se não alterada: `Caminho@2026!`.

Use viagens e crianças fictícias. A demonstração não cria viagens nem confirmações automaticamente. O motorista deve preparar/iniciar as viagens da data correta; a escola não pode iniciá-las.

## Receber na escola

1. Após entrar, confira a **Central da escola**, data e contexto. Se necessário, selecione a data da viagem.
2. Em **Receber na escola**, localize a criança por nome/identificador ou filtre a van.
3. Depois do recebimento presencial fictício, clique uma vez em **Recebi na escola**. Não deve abrir uma janela de confirmação.
4. A linha permanece no lugar e informa o funcionário que confirmou. Se o motorista ainda não registrou, deve continuar **aguardando motorista**.
5. O motorista registra o próprio desembarque. A central atualiza automaticamente ou pelo botão de atualização. Confirmação das duas partes não deve apagar ocorrência anterior.

## Entregar ao transporte

1. Abra **Entregar ao transporte** para uma viagem de volta já iniciada.
2. Depois da entrega presencial fictícia ao transporte, clique em **Entreguei ao motorista**.
3. Confira a autoria da escola e a pendência do motorista. A família não confirma esse embarque; seu recebimento será em casa.
4. Se faltar um lado por 15 minutos, confira crítico para coordenação da própria escola e motorista. Quem já confirmou não deve receber cobrança de nova confirmação.

## Casos importantes

- Dois funcionários clicando na mesma criança: somente um registro do lado da escola, com autor correto.
- Duplo clique/reenvio: sem duplicar confirmação ou notificações.
- Homônimos e várias vans: manter criança, identificação, placa e viagem distinguíveis.
- Recebimento sem embarque validado: permitir registrar onde foi recebida e manter a ocorrência de sequência.
- Viagem planejada, vínculo inativo ou criança de outra escola: não permitir confirmar; apresentar o motivo autorizado.
- Rede interrompida: não anunciar sucesso sem resposta. Atualizar o estado antes de repetir, pois a resposta pode se perder depois do commit.
- Correção aprovada: original preservado, sem check verde de confirmação vigente. Encerramento normal de ocorrência não pode usar validação histórica invalidada.
- Contabilização excepcional: aparece separada das entregas normais; exige os procedimentos e a nova conferência já definidos.
- Celular: confira as duas abas, filtros, botões e detalhes sem rolagem horizontal.

Links de alertas e notificações devem continuar abrindo o detalhe correto. Para trocar o contexto de atuação, use **Visão geral → Contexto atual**; a central muda para a escola selecionada e não reutiliza dados do contexto anterior.

Pare nesta rodada para testar a escola. A simplificação completa das telas do motorista e do responsável fica para a próxima entrega.
