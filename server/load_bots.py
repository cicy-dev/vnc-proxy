import pymysql, json
conn = pymysql.connect(host="localhost", user="root", password="pb200898", database="tts_bot", charset="utf8mb4")
c = conn.cursor()
c.execute("SELECT bot_name, tmux_session, tmux_window, group_name, ttyd_port, ttyd_token FROM bot_config WHERE status='active'")
print(json.dumps([{"bot_name":r[0],"tmux_session":r[1],"tmux_window":r[2],"group":r[3],"ttyd_port":r[4],"ttyd_token":r[5]} for r in c.fetchall()]))
conn.close()
