from fastapi import FastAPI
import socketio
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# FastAPI 인스턴스 생성
app = FastAPI()

# Socket.IO 서버 생성
sio: socketio.AsyncServer = socketio.AsyncServer(
    async_mode='asgi',
    credits=True,
    cors_allowed_origins=[
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://admin.socket.io',
    ])

# FastAPI 인스턴스에 CORS 미들웨어 추가
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://admin.socket.io',
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 인증 설정
sio.instrument(auth=False)

# ASGI 생성
combined_asgi_app = socketio.ASGIApp(sio, app)

@sio.on("connect")
async def connected(sid, *args, **kwargs):
    print("New socket connected ", sid)

# 사용자 정보를 저장할 딕셔너리
sessions = {}

# 방 및 사용자 정보를 저장할 딕셔너리
roomsName = {}
usersName = {}

# 방 내부 사용자 목록 관리
usersInRoom = {}

@sio.on("readyForStream")
async def joined(sid, roomName, userName):
    sessions[roomName] = {"userName": userName,
                          "mute_audio": False, "mute_video": False}
    await sio.emit("readyForStreamSuccess", {"roomName": roomName}, room=sid)
   # print(f"rooName: {roomName}, userName: {userName}, sid: {sid}")

@sio.on("join_room")
async def on_join_room(sid, roomName):
    userName = sessions[roomName]["userName"]

    # 중복 참여 확인
    if sid in roomsName:
        print(f"User {userName} with SID {sid} is already in room {roomsName[sid]}.")
        return
    if userName in usersName.values():
        print(f"User {userName} is already in a room.")
        return

    print(f"join_success {userName} in {roomName}")
    print(f"{sid}")

    await sio.enter_room(room=roomName, sid=sid)
    roomsName[sid] = roomName
    usersName[sid] = userName

    print(f"[{roomName}] New member joined: {userName}<{sid}>")

    await sio.emit("user_join", {"sid": sid, "userName": userName}, room=roomName, skip_sid=sid)


    # if roomName not in usersInRoom:
    #     usersInRoom[roomName] = [sid]

    #     await sio.emit("user_list", {"my_id": sid}, to=sid)
    # else:
    #    userList = {userName: usersName[userName]
    #                for userName in usersInRoom[roomName]}
       
    #    await sio.emit("user_list", {"list": userList, "my_id": sid}, to=sid)
    #    usersInRoom[roomName].append(sid)
    #    print(f"users: {usersInRoom}")


# FastAPI Start Setting
if __name__ == '__main__':
    uvicorn.run(combined_asgi_app, host='127.0.0.1', port=5000, reload=True)
