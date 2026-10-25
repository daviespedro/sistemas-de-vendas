-- =====================================================================
-- Sistema de Vendas com Comissões, Metas e Performance
-- Script de criação do banco, tabelas, relacionamentos e dados de teste
-- Execução: mysql -u root -p < sql/db_vendas.sql
-- =====================================================================

DROP DATABASE IF EXISTS db_vendas;
CREATE DATABASE db_vendas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE db_vendas;

-- ---------------------------------------------------------------------
-- Tabela: vendedores
-- ---------------------------------------------------------------------
CREATE TABLE vendedores (
    id_vendedor      INT           NOT NULL AUTO_INCREMENT,
    nome             VARCHAR(100)  NOT NULL,
    meta_mensal      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    percentual_base  DECIMAL(5,2)  NOT NULL,
    ativo            BOOLEAN       NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id_vendedor),
    CONSTRAINT chk_vendedor_meta  CHECK (meta_mensal >= 0),
    CONSTRAINT chk_vendedor_pbase CHECK (percentual_base >= 0 AND percentual_base <= 100)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Tabela: regioes
-- ---------------------------------------------------------------------
CREATE TABLE regioes (
    id_regiao         INT          NOT NULL AUTO_INCREMENT,
    nome_regiao       VARCHAR(50)  NOT NULL,
    percentual_bonus  DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (id_regiao),
    CONSTRAINT uq_regiao_nome UNIQUE (nome_regiao),
    CONSTRAINT chk_regiao_nome  CHECK (nome_regiao IN ('Norte','Nordeste','Sudeste','Sul')),
    CONSTRAINT chk_regiao_bonus CHECK (percentual_bonus >= 0 AND percentual_bonus <= 100)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Tabela: vendas
-- id_venda é o código único da venda (pode ser informado na API; se
-- omitido, o MySQL gera o próximo valor).
-- ---------------------------------------------------------------------
CREATE TABLE vendas (
    id_venda        INT           NOT NULL AUTO_INCREMENT,
    id_vendedor     INT           NOT NULL,
    id_regiao       INT           NOT NULL,
    data_venda      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valor_venda     DECIMAL(12,2) NOT NULL,
    tipo_cliente    ENUM('PF','PJ') NOT NULL,
    valor_comissao  DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (id_venda),
    CONSTRAINT fk_venda_vendedor FOREIGN KEY (id_vendedor)
        REFERENCES vendedores (id_vendedor) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_venda_regiao FOREIGN KEY (id_regiao)
        REFERENCES regioes (id_regiao) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_venda_valor    CHECK (valor_venda > 0),
    CONSTRAINT chk_venda_comissao CHECK (valor_comissao >= 0),
    INDEX idx_venda_data (data_venda),
    INDEX idx_venda_vendedor (id_vendedor),
    INDEX idx_venda_regiao (id_regiao)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Dados de teste: regiões (bônus regionais do enunciado)
-- ---------------------------------------------------------------------
INSERT INTO regioes (id_regiao, nome_regiao, percentual_bonus) VALUES
    (1, 'Norte',    1.00),
    (2, 'Nordeste', 1.00),
    (3, 'Sudeste',  0.00),
    (4, 'Sul',      0.50);

-- ---------------------------------------------------------------------
-- Dados de teste: 5 vendedores
-- ---------------------------------------------------------------------
INSERT INTO vendedores (id_vendedor, nome, meta_mensal, percentual_base, ativo) VALUES
    (1, 'Ana Souza',    20000.00, 5.00, TRUE),
    (2, 'Bruno Lima',   15000.00, 4.00, TRUE),
    (3, 'Carla Mendes', 30000.00, 6.00, TRUE),
    (4, 'Diego Alves',  10000.00, 3.50, TRUE),
    (5, 'Elisa Ramos',  25000.00, 5.50, TRUE);

-- ---------------------------------------------------------------------
-- Dados de teste: 16 vendas em outubro/2026 + 2 em setembro/2026
-- Comissão = valor * (base + bônus cliente + bônus região) / 100
-- (PF = 2%, PJ = 3%; bônus de região vem da tabela regioes)
-- Metas em out/2026: Ana (20.800) e Carla (33.800) atingem;
-- Bruno, Diego e Elisa não atingem.
-- ---------------------------------------------------------------------
INSERT INTO vendas (id_venda, id_vendedor, id_regiao, data_venda, valor_venda, tipo_cliente, valor_comissao) VALUES
    (1001, 1, 1, '2026-10-02 09:15:00',  2000.00, 'PJ',  180.00),
    (1002, 1, 2, '2026-10-05 14:30:00',  4500.00, 'PF',  360.00),
    (1003, 1, 3, '2026-10-12 11:00:00',  8200.00, 'PJ',  656.00),
    (1004, 1, 4, '2026-10-20 16:45:00',  6100.00, 'PF',  457.50),
    (1005, 2, 2, '2026-10-03 10:20:00',  3800.00, 'PF',  266.00),
    (1006, 2, 3, '2026-10-09 15:10:00',  5200.00, 'PJ',  364.00),
    (1007, 2, 1, '2026-10-18 13:00:00',  2600.00, 'PF',  182.00),
    (1008, 3, 3, '2026-10-04 08:50:00', 12500.00, 'PJ', 1125.00),
    (1009, 3, 4, '2026-10-10 17:20:00',  9800.00, 'PJ',  931.00),
    (1010, 3, 1, '2026-10-15 12:35:00',  7400.00, 'PF',  666.00),
    (1011, 3, 2, '2026-10-22 09:05:00',  4100.00, 'PJ',  410.00),
    (1012, 4, 4, '2026-10-06 14:00:00',  2900.00, 'PF',  174.00),
    (1013, 4, 3, '2026-10-14 10:40:00',  3300.00, 'PJ',  214.50),
    (1014, 5, 1, '2026-10-07 11:25:00',  6700.00, 'PJ',  636.50),
    (1015, 5, 2, '2026-10-16 15:55:00',  9100.00, 'PF',  773.50),
    (1016, 5, 4, '2026-10-21 10:10:00',  5800.00, 'PJ',  522.00),
    (1017, 1, 2, '2026-09-15 10:00:00',  3000.00, 'PF',  240.00),
    (1018, 3, 3, '2026-09-22 14:00:00',  7000.00, 'PJ',  630.00);
