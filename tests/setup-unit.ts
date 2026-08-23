// 单元测试隔离：防止误连真实 Turso 数据库。
// .env（由 setup-dotenv.ts 加载）可能包含真实 TURSO_AUTH_TOKEN，
// 若不删除，recordParse 在普通单测中会真实建表/写库（libsql 走 HTTP fetch）。
// 需要数据库的用例应显式 mock @libsql/client 或临时设置环境变量。
delete process.env.TURSO_DB_URL;
delete process.env.TURSO_AUTH_TOKEN;
