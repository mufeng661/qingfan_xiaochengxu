CREATE TABLE IF NOT EXISTS rooms_self (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  room_no       CHAR(6)      NOT NULL,
  join_code     VARCHAR(8)   NULL,
  daily_min     INT          NOT NULL DEFAULT 30,
  name          VARCHAR(60)  NOT NULL,
  owner_id      VARCHAR(128) NOT NULL,
  password_hash VARCHAR(255) NULL,
  password_salt VARCHAR(64)  NULL,
  is_deleted    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    BIGINT       NULL,
  updated_at    BIGINT       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_rooms_room_no (room_no),
  UNIQUE KEY uk_rooms_join_code (join_code),
  KEY idx_rooms_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS room_members_self (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  room_id        CHAR(6)      NOT NULL,
  user_id        VARCHAR(128) NOT NULL,
  role           VARCHAR(20)  NOT NULL DEFAULT 'member',
  nickname       VARCHAR(50)  NULL,
  joined_at      BIGINT       NULL,
  last_active_at BIGINT       NULL,
  focus_days     JSON         NULL,
  focusing       TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_room_user (room_id, user_id),
  KEY idx_members_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comments_self (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  project_id    VARCHAR(64)  NOT NULL,
  parent_id     BIGINT       NULL,
  root_id       BIGINT       NULL,
  reply_to_name VARCHAR(50)  NULL,
  nickname      VARCHAR(50)  NULL,
  avatar        VARCHAR(512) NULL,
  content       TEXT         NULL,
  user_id       VARCHAR(128) NULL,
  role          VARCHAR(20)  NULL,
  platform      VARCHAR(20)  NULL,
  likes         INT          NOT NULL DEFAULT 0,
  liked_by      JSON         NULL,
  is_deleted    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    BIGINT       NULL,
  updated_at    BIGINT       NULL,
  PRIMARY KEY (id),
  KEY idx_comments_project (project_id),
  KEY idx_comments_parent (parent_id),
  KEY idx_comments_root (root_id),
  KEY idx_comments_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users_self (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  phone         VARCHAR(20)  NOT NULL,
  username      VARCHAR(50)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(64)  NOT NULL,
  avatar_seed   VARCHAR(10)  NULL,
  bio           VARCHAR(255) NULL,
  created_at    BIGINT       NULL,
  updated_at    BIGINT       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_data_self (
  user_id    VARCHAR(128) NOT NULL,
  tasks      JSON         NULL,
  records    JSON         NULL,
  stats      JSON         NULL,
  profile    JSON         NULL,
  updated_at BIGINT       NULL,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_usage_self (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  user_id    VARCHAR(128) NOT NULL,
  usage_date VARCHAR(10)  NOT NULL,
  used       INT          NOT NULL DEFAULT 0,
  last_at    BIGINT       NULL,
  created_at BIGINT       NULL,
  updated_at BIGINT       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_usage (user_id, usage_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
