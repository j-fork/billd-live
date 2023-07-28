import { getRandomString } from 'billd-utils';
import { reactive, ref, watch } from 'vue';

import { fetchRtcV1Play, fetchRtcV1Publish } from '@/api/srs';
import { WEBSOCKET_URL } from '@/constant';
import {
  DanmuMsgTypeEnum,
  IAnswer,
  ICandidate,
  IDanmu,
  IHeartbeat,
  IJoin,
  ILive,
  ILiveUser,
  IMessage,
  IOffer,
  IOtherJoin,
  IUpdateJoinInfo,
  LiveRoomTypeEnum,
  liveTypeEnum,
} from '@/interface';
import { WebRTCClass } from '@/network/webRTC';
import {
  WebSocketClass,
  WsConnectStatusEnum,
  WsMsgTypeEnum,
  prettierReceiveWebsocket,
} from '@/network/webSocket';
import { AppRootState, useAppStore } from '@/store/app';
import { useNetworkStore } from '@/store/network';
import { useUserStore } from '@/store/user';

export const useWs = () => {
  const appStore = useAppStore();
  const userStore = useUserStore();
  const networkStore = useNetworkStore();
  const heartbeatTimer = ref();
  const liveUserList = ref<ILiveUser[]>([]);
  const roomId = ref('');
  const roomName = ref('');
  const roomNoLive = ref(false);
  const roomLiveing = ref<IJoin['data']>();
  const liveRoomInfo = ref<ILive>();
  const isAnchor = ref(false);
  const roomLiveType = ref(liveTypeEnum.srsFlvPull);
  const joined = ref(false);
  const isSRS = ref(false);
  const isPull = ref(false);
  const trackInfo = reactive({ track_audio: 1, track_video: 1 });
  const localVideo = ref<HTMLVideoElement>(document.createElement('video'));
  const localStream = ref<MediaStream>();
  const canvasVideoStream = ref<MediaStream>();
  const lastCoverImg = ref('');
  const maxBitrate = ref([
    {
      label: '1',
      value: 1,
    },
    {
      label: '10',
      value: 10,
    },
    {
      label: '1000',
      value: 1000,
    },
    {
      label: '2000',
      value: 2000,
    },
    {
      label: '3000',
      value: 3000,
    },
    {
      label: '4000',
      value: 4000,
    },
    {
      label: '5000',
      value: 5000,
    },
    {
      label: '6000',
      value: 6000,
    },
    {
      label: '7000',
      value: 7000,
    },
    {
      label: '8000',
      value: 8000,
    },
    {
      label: '9000',
      value: 9000,
    },
    {
      label: '10000',
      value: 10000,
    },
  ]);
  const maxFramerate = ref([
    {
      label: '1帧',
      value: 1,
    },
    {
      label: '10帧',
      value: 10,
    },
    {
      label: '20帧',
      value: 20,
    },
    {
      label: '30帧',
      value: 30,
    },
    {
      label: '60帧',
      value: 60,
    },
  ]);
  const resolutionRatio = ref([
    {
      label: '360P',
      value: 360,
    },
    {
      label: '720P',
      value: 720,
    },
    {
      label: '1080P',
      value: 1080,
    },
    // {
    //   label: '1440P',
    //   value: 1440,
    // },
  ]);
  const currentMaxBitrate = ref(maxBitrate.value[2].value);
  const currentResolutionRatio = ref(resolutionRatio.value[2].value);
  const currentMaxFramerate = ref(maxFramerate.value[2].value);

  const damuList = ref<IDanmu[]>([]);

  watch(
    () => appStore.allTrack,
    (newTrack, oldTrack) => {
      console.log('appStore.allTrack变了');
      const mixedStream = new MediaStream();
      newTrack.forEach((item) => {
        mixedStream.addTrack(item.track);
      });
      console.log('新的allTrack音频轨', mixedStream.getAudioTracks());
      console.log('新的allTrack视频轨', mixedStream.getVideoTracks());
      console.log('旧的allTrack音频轨', localStream.value?.getAudioTracks());
      console.log('旧的allTrack视频轨', localStream.value?.getVideoTracks());
      localStream.value = mixedStream;
      if (isSRS.value) {
        if (!isPull.value) {
          networkStore.rtcMap.forEach((rtc) => {
            rtc.close();
          });
          startNewWebRtc({
            receiver: 'srs',
            videoEl: localVideo.value,
          });
        }
      }
    },
    { deep: true }
  );

  watch(
    () => currentResolutionRatio.value,
    (newVal) => {
      if (canvasVideoStream.value) {
        canvasVideoStream.value.getVideoTracks().forEach((track) => {
          track.applyConstraints({
            frameRate: { max: currentMaxFramerate.value },
            height: newVal,
          });
        });
      } else {
        appStore.allTrack.forEach((info) => {
          info.track.applyConstraints({
            frameRate: { max: currentMaxFramerate.value },
            height: newVal,
          });
        });
      }

      networkStore.rtcMap.forEach(async (rtc) => {
        const res = await rtc.setResolutionRatio(newVal);
        if (res === 1) {
          window.$message.success('切换分辨率成功！');
        } else {
          window.$message.success('切换分辨率失败！');
        }
      });
    }
  );

  watch(
    () => currentMaxFramerate.value,
    (newVal) => {
      console.log(currentMaxFramerate.value, 'currentMaxFramerate.value');
      if (canvasVideoStream.value) {
        canvasVideoStream.value.getVideoTracks().forEach((track) => {
          track.applyConstraints({
            frameRate: { max: newVal },
            height: currentResolutionRatio.value,
          });
        });
      } else {
        appStore.allTrack.forEach((info) => {
          info.track.applyConstraints({
            frameRate: { max: newVal },
            height: currentResolutionRatio.value,
          });
        });
      }

      networkStore.rtcMap.forEach(async (rtc) => {
        const res = await rtc.setMaxFramerate(newVal);
        if (res === 1) {
          window.$message.success('切换帧率成功！');
        } else {
          window.$message.success('切换帧率失败！');
        }
      });
    }
  );

  watch(
    () => currentMaxBitrate.value,
    (newVal) => {
      networkStore.rtcMap.forEach(async (rtc) => {
        const res = await rtc.setMaxBitrate(newVal);
        if (res === 1) {
          window.$message.success('切换码率成功！');
        } else {
          window.$message.success('切换码率失败！');
        }
      });
    }
  );

  function addTrack(addTrackInfo: { track; stream }) {
    if (isAnchor.value) {
      networkStore.rtcMap.forEach((rtc) => {
        const sender = rtc.peerConnection
          ?.getSenders()
          .find((sender) => sender.track?.id === addTrackInfo.track.id);
        if (!sender) {
          console.log('pc添加track-1');
          rtc.peerConnection?.addTrack(addTrackInfo.track, addTrackInfo.stream);
        }
      });
    }
    const mixedStream = new MediaStream();
    appStore.allTrack.forEach((item) => {
      mixedStream.addTrack(item.track);
    });
    console.log('addTrack后结果的音频轨', mixedStream.getAudioTracks());
    console.log('addTrack后结果的视频轨', mixedStream.getVideoTracks());
    localStream.value = mixedStream;
    // srs不需要更新，因为更新了之后，跟着就关闭当前rtc然后重新new一个新的rtc了
    if (!isSRS.value) {
      let resUrl = '';
      const rtmpUrl = userStore.userInfo?.live_rooms?.[0].rtmp_url!;
      if (rtmpUrl.indexOf('type=') === -1) {
        resUrl += `${rtmpUrl}&type=${
          isSRS.value ? LiveRoomTypeEnum.user_srs : LiveRoomTypeEnum.user_wertc
        }`;
      } else {
        resUrl = rtmpUrl.replace(
          /type=([0-9]+)/,
          `type=${
            isSRS.value
              ? LiveRoomTypeEnum.user_srs
              : LiveRoomTypeEnum.user_wertc
          }`
        );
      }
      const data: IUpdateJoinInfo['data'] = {
        live_room_id: Number(roomId.value),
        track: {
          audio: appStore.getTrackInfo().audio > 0 ? 1 : 2,
          video: appStore.getTrackInfo().video > 0 ? 1 : 2,
        },
        rtmp_url: resUrl,
      };
      networkStore.wsMap.get(roomId.value)?.send({
        msgType: WsMsgTypeEnum.updateJoinInfo,
        data,
      });
    }
  }

  function delTrack(delTrackInfo: AppRootState['allTrack'][0]) {
    if (isAnchor.value) {
      networkStore.rtcMap.forEach((rtc) => {
        const sender = rtc.peerConnection
          ?.getSenders()
          .find((sender) => sender.track?.id === delTrackInfo.track.id);
        if (sender) {
          console.log('删除track', delTrackInfo, sender);
          rtc.peerConnection?.removeTrack(sender);
        }
      });
    }
    const mixedStream = new MediaStream();
    appStore.allTrack.forEach((item) => {
      mixedStream.addTrack(item.track);
    });
    console.log('delTrack后结果的音频轨', mixedStream.getAudioTracks());
    console.log('delTrack后结果的视频轨', mixedStream.getVideoTracks());
    localStream.value = mixedStream;
    if (!isSRS.value) {
      let resUrl = '';
      const rtmpUrl = userStore.userInfo?.live_rooms?.[0].rtmp_url!;
      if (rtmpUrl.indexOf('type=') === -1) {
        resUrl += `${rtmpUrl}&type=${
          isSRS.value ? LiveRoomTypeEnum.user_srs : LiveRoomTypeEnum.user_wertc
        }`;
      } else {
        resUrl = rtmpUrl.replace(
          /type=([0-9]+)/,
          `type=${
            isSRS.value
              ? LiveRoomTypeEnum.user_srs
              : LiveRoomTypeEnum.user_wertc
          }`
        );
      }
      const data: IUpdateJoinInfo['data'] = {
        live_room_id: Number(roomId.value),
        track: {
          audio: appStore.getTrackInfo().audio > 0 ? 1 : 2,
          video: appStore.getTrackInfo().video > 0 ? 1 : 2,
        },
        rtmp_url: resUrl,
      };
      networkStore.wsMap.get(roomId.value)?.send({
        msgType: WsMsgTypeEnum.updateJoinInfo,
        data,
      });
    }
  }

  function getSocketId() {
    return networkStore.wsMap.get(roomId.value)?.socketIo?.id || '-1';
  }

  function handleHeartbeat(liveId: number) {
    heartbeatTimer.value = setInterval(() => {
      const instance = networkStore.wsMap.get(roomId.value);
      if (!instance) return;
      const heartbeatData: IHeartbeat['data'] = {
        live_id: liveId,
        live_room_id: Number(roomId.value),
      };
      instance.send({
        msgType: WsMsgTypeEnum.heartbeat,
        data: heartbeatData,
      });
    }, 1000 * 5);
  }

  async function sendOffer({
    sender,
    receiver,
  }: {
    sender: string;
    receiver: string;
  }) {
    console.log('开始sendOffer');
    const ws = networkStore.wsMap.get(roomId.value);
    if (!ws) return;
    const rtc = networkStore.getRtcMap(`${roomId.value}___${receiver}`);
    if (!rtc) return;
    if (!isSRS.value) {
      const sdp = await rtc.createOffer();
      await rtc.setLocalDescription(sdp!);
      ws.send({
        msgType: WsMsgTypeEnum.offer,
        data: {
          sdp,
          sender,
          receiver,
          live_room_id: roomId.value,
        },
      });
    } else {
      const sdp = await rtc.createOffer();
      await rtc.setLocalDescription(sdp!);
      let res;

      if (isPull.value) {
        console.log(
          roomLiveing.value,
          2222222222,
          roomLiveing.value!.live!.live_room!.rtmp_url!.replace(
            'rtmp',
            'webrtc'
          )
        );
        res = await fetchRtcV1Play({
          api: `/rtc/v1/play/`,
          clientip: null,
          sdp: sdp!.sdp!,
          streamurl: roomLiveing.value!.live!.live_room!.rtmp_url!.replace(
            'rtmp',
            'webrtc'
          ),
          tid: getRandomString(10),
        });
      } else {
        res = await fetchRtcV1Publish({
          api: `/rtc/v1/publish/`,
          clientip: null,
          sdp: sdp!.sdp!,
          streamurl: userStore.userInfo!.live_rooms![0]!.rtmp_url!.replace(
            'rtmp',
            'webrtc'
          ),
          tid: getRandomString(10),
        });
        const data: IUpdateJoinInfo['data'] = {
          live_room_id: Number(roomId.value),
          track: {
            audio: appStore.getTrackInfo().audio > 0 ? 1 : 2,
            video: appStore.getTrackInfo().video > 0 ? 1 : 2,
          },
        };
        networkStore.wsMap.get(roomId.value)?.send({
          msgType: WsMsgTypeEnum.updateJoinInfo,
          data,
        });
      }
      if (res.data.code !== 0) {
        console.error('/rtc/v1/publish/拿不到sdp');
        return;
      }
      await rtc.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp: res.data.sdp })
      );
    }
  }

  function sendJoin() {
    const instance = networkStore.wsMap.get(roomId.value);
    if (!instance) return;
    let resUrl = '';
    const rtmpUrl = userStore.userInfo?.live_rooms?.[0].rtmp_url;
    // 如果是用户看直播，发送join时不需要rtmpUrl；只有房主直播的时候需要带rtmpUrl
    if (rtmpUrl) {
      if (rtmpUrl.indexOf('type=') === -1) {
        resUrl += `${rtmpUrl}&type=${
          isSRS.value ? LiveRoomTypeEnum.user_srs : LiveRoomTypeEnum.user_wertc
        }`;
      } else {
        resUrl = rtmpUrl.replace(
          /type=([0-9]+)/,
          `type=${
            isSRS.value
              ? LiveRoomTypeEnum.user_srs
              : LiveRoomTypeEnum.user_wertc
          }`
        );
      }
    }
    const joinData: IJoin['data'] = {
      live_room: {
        id: Number(roomId.value),
        name: roomName.value,
        cover_img: lastCoverImg.value,
        type: isSRS.value
          ? LiveRoomTypeEnum.user_srs
          : LiveRoomTypeEnum.user_wertc,
        rtmp_url: resUrl,
      },
      live: {
        track_audio: appStore.getTrackInfo().audio > 0 ? 1 : 2,
        track_video: appStore.getTrackInfo().video > 0 ? 1 : 2,
      },
    };
    instance.send({
      msgType: WsMsgTypeEnum.join,
      data: joinData,
    });
  }

  function handleNegotiationneeded(data: { roomId: string; isSRS: boolean }) {
    console.warn(`${data.roomId}，开始监听pc的negotiationneeded`);
    const rtc = networkStore.getRtcMap(data.roomId);
    if (!rtc) return;
    console.warn(`监听pc的negotiationneeded`);
    rtc.peerConnection?.addEventListener('negotiationneeded', (event) => {
      console.warn(`${data.roomId}，pc收到negotiationneeded`, event);
      sendOffer({
        sender: getSocketId(),
        receiver: rtc.receiver,
      });
    });
  }

  /** 原生的webrtc时，receiver必传 */
  function startNewWebRtc({
    receiver,
    videoEl,
  }: {
    receiver: string;
    videoEl: HTMLVideoElement;
  }) {
    let rtc: WebRTCClass;
    if (isSRS.value) {
      console.warn('SRS开始new WebRTCClass', `${roomId.value}___${receiver!}`);
      rtc = new WebRTCClass({
        maxBitrate: isPull.value ? -1 : currentMaxBitrate.value,
        maxFramerate: isPull.value ? -1 : currentMaxFramerate.value,
        resolutionRatio: isPull.value ? -1 : currentResolutionRatio.value,
        roomId: `${roomId.value}___${receiver!}`,
        videoEl,
        isSRS: true,
        receiver,
      });
      if (isPull.value) {
        if (trackInfo.track_video === 1) {
          rtc.peerConnection?.addTransceiver('video', {
            direction: 'recvonly',
          });
        }
        if (trackInfo.track_audio === 1) {
          rtc.peerConnection?.addTransceiver('audio', {
            direction: 'recvonly',
          });
        }
      }
      // handleNegotiationneeded({
      //   roomId: `${roomId.value}___${receiver}`,
      //   isSRS: true,
      // });
      if (canvasVideoStream.value) {
        localStream.value = canvasVideoStream.value;
      }
      rtc.localStream = localStream.value;
      localStream.value?.getTracks().forEach((track) => {
        console.warn(
          'srs startNewWebRtc，pc插入track',
          track.id,
          track.getSettings().height,
          track.getSettings().width,
          localStream.value?.id
        );
        console.log('pc添加track-2');
        rtc.peerConnection?.addTrack(track, localStream.value!);
      });

      sendOffer({
        sender: getSocketId(),
        receiver,
      });
    } else {
      console.warn('开始new WebRTCClass', `${roomId.value}___${receiver!}`);
      rtc = new WebRTCClass({
        maxBitrate: isPull.value ? -1 : currentMaxBitrate.value,
        maxFramerate: isPull.value ? -1 : currentMaxFramerate.value,
        resolutionRatio: isPull.value ? -1 : currentResolutionRatio.value,
        roomId: `${roomId.value}___${receiver!}`,
        videoEl,
        isSRS: false,
        receiver,
      });
      if (isAnchor.value) {
        handleNegotiationneeded({
          roomId: `${roomId.value}___${receiver}`,
          isSRS: false,
        });
        rtc.localStream = localStream.value;
        localStream.value?.getTracks().forEach((track) => {
          // rtc.peerConnection?.addTransceiver(track, {
          //   streams: [localStream.value!],
          //   direction: 'sendonly',
          // });
          console.log('pc添加track-3');
          rtc.peerConnection?.addTrack(track, localStream.value!);
        });
      }
    }
    return rtc;
  }

  function initReceive() {
    const ws = networkStore.wsMap.get(roomId.value);
    if (!ws?.socketIo) return;
    // websocket连接成功
    ws.socketIo.on(WsConnectStatusEnum.connect, () => {
      prettierReceiveWebsocket(WsConnectStatusEnum.connect);
      if (!ws) return;
      ws.status = WsConnectStatusEnum.connect;
      ws.update();
      sendJoin();
    });

    // websocket连接断开
    ws.socketIo.on(WsConnectStatusEnum.disconnect, () => {
      prettierReceiveWebsocket(WsConnectStatusEnum.disconnect, ws);
      if (!ws) return;
      ws.status = WsConnectStatusEnum.disconnect;
      ws.update();
    });

    // 收到offer
    ws.socketIo.on(WsMsgTypeEnum.offer, async (data: IOffer) => {
      prettierReceiveWebsocket(
        WsMsgTypeEnum.offer,
        `发送者：${data.data.sender}，接收者：${data.data.receiver}`,
        data
      );
      if (isSRS.value) return;
      if (!ws) return;
      if (data.data.receiver === getSocketId()) {
        console.log('收到offer，这个offer是发给我的');
        if (!isAnchor.value) {
          // 如果是用户进来看直播
          let rtc = networkStore.getRtcMap(
            `${roomId.value}___${data.data.sender}`
          );
          if (!rtc) {
            rtc = await startNewWebRtc({
              receiver: data.data.sender,
              videoEl: localVideo.value,
            });
          }
          await rtc.setRemoteDescription(data.data.sdp);
          const sdp = await rtc.createAnswer();
          await rtc.setLocalDescription(sdp!);
          const answerData: IAnswer = {
            sdp,
            sender: getSocketId(),
            receiver: data.data.sender,
            live_room_id: data.data.live_room_id,
          };
          ws.send({
            msgType: WsMsgTypeEnum.answer,
            data: answerData,
          });
        }
      } else {
        console.log('收到offer，但是这个offer不是发给我的');
      }
    });

    // 收到answer
    ws.socketIo.on(WsMsgTypeEnum.answer, async (data: IOffer) => {
      prettierReceiveWebsocket(
        WsMsgTypeEnum.answer,
        `发送者：${data.data.sender}，接收者：${data.data.receiver}`,
        data
      );
      if (isSRS.value) return;
      if (!ws) return;
      const rtc = networkStore.getRtcMap(`${roomId.value}___${data.socket_id}`);
      if (!rtc) return;
      rtc.update();
      if (data.data.receiver === getSocketId()) {
        console.log('收到answer，这个answer是发给我的');
        await rtc.setRemoteDescription(data.data.sdp);
      } else {
        console.log('收到answer，但这个answer不是发给我的');
      }
    });

    // 收到candidate
    ws.socketIo.on(WsMsgTypeEnum.candidate, (data: ICandidate) => {
      prettierReceiveWebsocket(
        WsMsgTypeEnum.candidate,
        `发送者：${data.data.sender}，接收者：${data.data.receiver}`,
        data
      );
      if (isSRS.value) return;
      if (!ws) return;
      const rtc = networkStore.getRtcMap(`${roomId.value}___${data.socket_id}`);
      if (!rtc) return;
      if (data.socket_id !== getSocketId()) {
        console.log('不是我发的candidate');
        const candidate = new RTCIceCandidate({
          sdpMid: data.data.sdpMid,
          sdpMLineIndex: data.data.sdpMLineIndex,
          candidate: data.data.candidate,
        });
        rtc.peerConnection
          ?.addIceCandidate(candidate)
          .then(() => {
            console.log('candidate成功');
          })
          .catch((err) => {
            console.error('candidate失败', err);
          });
      } else {
        console.log('是我发的candidate');
      }
    });

    // 管理员正在直播
    ws.socketIo.on(WsMsgTypeEnum.roomLiveing, (data: IJoin) => {
      prettierReceiveWebsocket(WsMsgTypeEnum.roomLiveing, data);
      roomLiveing.value = data.data;
      console.log(isSRS.value, isPull.value, data, 111);
      // 如果是srs开播，则不需要等有人进来了才new webrtc，只要Websocket连上了就开始new webrtc
      if (isSRS.value) {
        if (isPull.value) {
          console.log('llllll');
          if (roomLiveType.value === liveTypeEnum.srsWebrtcPull) {
            startNewWebRtc({
              receiver: 'srs',
              videoEl: localVideo.value,
            });
          }
        }
      }
    });

    // 管理员不在直播
    ws.socketIo.on(WsMsgTypeEnum.roomNoLive, (data) => {
      prettierReceiveWebsocket(WsMsgTypeEnum.roomNoLive, data);
      roomNoLive.value = true;
    });

    // 当前所有在线用户
    ws.socketIo.on(WsMsgTypeEnum.liveUser, (data) => {
      prettierReceiveWebsocket(WsMsgTypeEnum.liveUser, data);
    });

    // 收到用户发送消息
    ws.socketIo.on(WsMsgTypeEnum.message, (data: IMessage) => {
      prettierReceiveWebsocket(WsMsgTypeEnum.message, data);
      if (!ws) return;
      damuList.value.push({
        socket_id: data.socket_id,
        msgType: DanmuMsgTypeEnum.danmu,
        msg: data.data.msg,
        userInfo: data.user_info,
      });
    });

    // 用户加入房间完成
    ws.socketIo.on(WsMsgTypeEnum.joined, (data: IJoin) => {
      prettierReceiveWebsocket(WsMsgTypeEnum.joined, data);
      handleHeartbeat(data.data.live?.id || -1);
      joined.value = true;
      trackInfo.track_audio = data.data.live?.track_audio!;
      trackInfo.track_video = data.data.live?.track_video!;
      liveUserList.value.push({
        id: `${getSocketId()}`,
        userInfo: data.user_info,
      });
      if (!isAnchor.value) {
        liveRoomInfo.value = data.data;
      }
      // 如果是srs开播，则不需要等有人进来了才new webrtc，只要Websocket连上了就开始new webrtc
      if (isSRS.value) {
        if (!isPull.value) {
          startNewWebRtc({
            receiver: 'srs',
            videoEl: localVideo.value,
          });
        }
      }
    });

    // 其他用户加入房间
    ws.socketIo.on(WsMsgTypeEnum.otherJoin, (data: IOtherJoin) => {
      prettierReceiveWebsocket(WsMsgTypeEnum.otherJoin, data);
      liveUserList.value.push({
        id: data.data.join_socket_id,
        userInfo: data.data.liveRoom.user,
      });
      const danmu: IDanmu = {
        msgType: DanmuMsgTypeEnum.otherJoin,
        socket_id: data.data.join_socket_id,
        userInfo: data.data.liveRoom.user,
        msg: '',
      };
      damuList.value.push(danmu);
      // 如果是srs开播，且进来的用户不是srs-webrtc-pull，则不能再new webrtc了
      if (isSRS.value) return;
      if (joined.value) {
        startNewWebRtc({
          receiver: data.data.join_socket_id,
          videoEl: localVideo.value,
        });
      }
    });

    // 用户离开房间
    ws.socketIo.on(WsMsgTypeEnum.leave, (data) => {
      prettierReceiveWebsocket(WsMsgTypeEnum.leave, data);
      if (!ws) return;
      ws.send({
        msgType: WsMsgTypeEnum.leave,
        data: { roomId: ws.roomId },
      });
    });

    // 用户离开房间完成
    ws.socketIo.on(WsMsgTypeEnum.leaved, (data) => {
      prettierReceiveWebsocket(WsMsgTypeEnum.leaved, data);
      networkStore.rtcMap
        .get(`${roomId.value}___${data.socketId as string}`)
        ?.close();
      networkStore.removeRtc(`${roomId.value}___${data.socketId as string}`);
      const res = liveUserList.value.filter(
        (item) => item.id !== data.socketId
      );
      liveUserList.value = res;
      damuList.value.push({
        socket_id: data.socketId,
        msgType: DanmuMsgTypeEnum.userLeaved,
        msg: '',
      });
    });
  }

  function initWs(data: {
    isAnchor: boolean;
    roomId: string;
    isSRS: boolean;
    isPull: boolean;
    currentResolutionRatio?: number;
    currentMaxFramerate?: number;
    currentMaxBitrate?: number;
    roomLiveType: liveTypeEnum;
  }) {
    roomId.value = data.roomId;
    isAnchor.value = data.isAnchor;
    roomLiveType.value = data.roomLiveType;
    if (data.currentMaxBitrate) {
      currentMaxBitrate.value = data.currentMaxBitrate;
    }
    if (data.currentMaxFramerate) {
      currentMaxFramerate.value = data.currentMaxFramerate;
    }
    if (data.currentResolutionRatio) {
      currentResolutionRatio.value = data.currentResolutionRatio;
    }
    isSRS.value = data.isSRS;
    isPull.value = data.isPull;
    new WebSocketClass({
      roomId: roomId.value,
      url: WEBSOCKET_URL,
      isAnchor: data.isAnchor,
    });
    initReceive();
  }

  return {
    getSocketId,
    initWs,
    addTrack,
    delTrack,
    canvasVideoStream,
    lastCoverImg,
    roomLiveing,
    liveRoomInfo,
    roomNoLive,
    heartbeatTimer,
    localStream,
    liveUserList,
    damuList,
    maxBitrate,
    maxFramerate,
    resolutionRatio,
    currentMaxFramerate,
    currentMaxBitrate,
    currentResolutionRatio,
  };
};
