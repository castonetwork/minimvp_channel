#!/usr/bin/env bash

CONFIG_PATH="/opt/janus/etc/janus"

BUILD_SRC="/usr/local/src"
JANUS_WITH_POSTPROCESSING="1"
JANUS_WITH_BORINGSSL="0"
JANUS_WITH_DOCS="0"
JANUS_WITH_REST="1"
JANUS_WITH_DATACHANNELS="0"
JANUS_WITH_WEBSOCKETS="1"
JANUS_WITH_MQTT="0"
JANUS_WITH_PFUNIX="0"
JANUS_WITH_RABBITMQ="0"

JANUS_WITH_FREESWITCH_PATCH="0"
JANUS_CONFIG_DEPS="\
--prefix=/opt/janus \
"
JANUS_CONFIG_OPTIONS="\
--disable-plugin-lua\
"
JANUS_BUILD_DEPS_DEV="\
libcurl4-openssl-dev \
libjansson-dev \
libssl-dev \
libsofia-sip-ua-dev \
libglib2.0-dev \
libopus-dev \
libogg-dev \
pkg-config \
"
JANUS_BUILD_DEPS_EXT="\
libavutil-dev \
libavcodec-dev \
libavformat-dev \
gengetopt \
libtool \
automake \
git-core \
build-essential \
cmake \
ca-certificates \
curl \
gtk-doc-tools \
"

if [ $JANUS_WITH_POSTPROCESSING = "1" ]; then export JANUS_CONFIG_OPTIONS="$JANUS_CONFIG_OPTIONS --enable-post-processing"; fi \
&& if [ $JANUS_WITH_BORINGSSL = "1" ]; then export JANUS_BUILD_DEPS_DEV="$JANUS_BUILD_DEPS_DEV golang-go" && export JANUS_CONFIG_OPTIONS="$JANUS_CONFIG_OPTIONS --enable-boringssl --enable-dtls-settimeout"; fi \
&& if [ $JANUS_WITH_DOCS = "1" ]; then export JANUS_BUILD_DEPS_DEV="$JANUS_BUILD_DEPS_DEV doxygen graphviz" && export JANUS_CONFIG_OPTIONS="$JANUS_CONFIG_OPTIONS --enable-docs"; fi \
&& if [ $JANUS_WITH_REST = "1" ]; then export JANUS_BUILD_DEPS_DEV="$JANUS_BUILD_DEPS_DEV libmicrohttpd-dev"; else export JANUS_CONFIG_OPTIONS="$JANUS_CONFIG_OPTIONS --disable-rest"; fi \
&& if [ $JANUS_WITH_DATACHANNELS = "0" ]; then export JANUS_CONFIG_OPTIONS="$JANUS_CONFIG_OPTIONS --disable-data-channels"; fi \
&& if [ $JANUS_WITH_WEBSOCKETS = "0" ]; then export JANUS_CONFIG_OPTIONS="$JANUS_CONFIG_OPTIONS --disable-websockets"; fi \
&& if [ $JANUS_WITH_MQTT = "0" ]; then export JANUS_CONFIG_OPTIONS="$JANUS_CONFIG_OPTIONS --disable-mqtt"; fi \
&& if [ $JANUS_WITH_PFUNIX = "0" ]; then export JANUS_CONFIG_OPTIONS="$JANUS_CONFIG_OPTIONS --disable-unix-sockets"; fi \
&& if [ $JANUS_WITH_RABBITMQ = "0" ]; then export JANUS_CONFIG_OPTIONS="$JANUS_CONFIG_OPTIONS --disable-rabbitmq"; fi \
&& /usr/sbin/groupadd -r janus && /usr/sbin/useradd -r -g janus janus \
&& DEBIAN_FRONTEND=noninteractive apt-get update \
&& DEBIAN_FRONTEND=noninteractive apt-get -y --no-install-recommends install $JANUS_BUILD_DEPS_DEV ${JANUS_BUILD_DEPS_EXT} \
# build libnice
&& git clone https://gitlab.freedesktop.org/libnice/libnice.git ${BUILD_SRC}/libnice \
&& cd ${BUILD_SRC}/libnice \
&& git fetch https://gitlab.freedesktop.org/lminiero/libnice.git master \
&& git checkout -b lminiero/libnice-master FETCH_HEAD \
&& git config --global user.email "remon@remotemonster.com" \
&& git config --global user.name "remon" \
&& git checkout 0.1.14 \
&& git checkout -b remon \
&& git merge --no-ff lminiero/libnice-master \
&& ./autogen.sh \
&& ./configure \
&& make install \
# build libsrtp
&& curl -fSL https://github.com/cisco/libsrtp/archive/v2.1.0.tar.gz -o ${BUILD_SRC}/v2.1.0.tar.gz \
&& tar xzf ${BUILD_SRC}/v2.1.0.tar.gz -C ${BUILD_SRC} \
&& cd ${BUILD_SRC}/libsrtp-2.1.0 \
&& ./configure --prefix=/usr --enable-openssl \
&& make shared_library \
&& make install \
# build boringssl
&& if [ $JANUS_WITH_BORINGSSL = "1" ]; then git clone https://boringssl.googlesource.com/boringssl ${BUILD_SRC}/boringssl \
&& cd ${BUILD_SRC}/boringssl \
&& sed -i s/" -Werror"//g CMakeLists.txt \
&& mkdir -p ${BUILD_SRC}/boringssl/build \
&& cd ${BUILD_SRC}/boringssl/build \
&& cmake -DCMAKE_CXX_FLAGS="-lrt" .. \
&& make \
&& mkdir -p /opt/boringssl \
&& cp -R ${BUILD_SRC}/boringssl/include /opt/boringssl/ \
&& mkdir -p /opt/boringssl/lib \
&& cp ${BUILD_SRC}/boringssl/build/ssl/libssl.a /opt/boringssl/lib/ \
&& cp ${BUILD_SRC}/boringssl/build/crypto/libcrypto.a /opt/boringssl/lib/ \
; fi \
# build usrsctp
&& if [ $JANUS_WITH_DATACHANNELS = "1" ]; then git clone https://github.com/sctplab/usrsctp ${BUILD_SRC}/usrsctp \
&& cd ${BUILD_SRC}/usrsctp \
&& ./bootstrap \
&& ./configure --prefix=/usr \
&& make \
&& make install \
; fi \
# build libwebsockets
&& if [ $JANUS_WITH_WEBSOCKETS = "1" ]; then curl -fSL https://github.com/warmcat/libwebsockets/archive/v2.4.1.tar.gz -o ${BUILD_SRC}/v2.4.1.tar.gz \
&& tar xzf ${BUILD_SRC}/v2.4.1.tar.gz -C ${BUILD_SRC} \
&& cd ${BUILD_SRC}/libwebsockets-2.4.1 \
#    && git checkout v1.5-chrome47-firefox41 \
&& mkdir ${BUILD_SRC}/libwebsockets-2.4.1/build \
&& cd ${BUILD_SRC}/libwebsockets-2.4.1/build \
&& cmake -DCMAKE_INSTALL_PREFIX:PATH=/usr -DCMAKE_C_FLAGS="-fpic" .. \
&& make \
&& make install \
; fi \
# build paho.mqtt.c
&& if [ $JANUS_WITH_MQTT = "1" ]; then git clone https://github.com/eclipse/paho.mqtt.c.git ${BUILD_SRC}/paho.mqtt.c \
&& cd ${BUILD_SRC}/paho.mqtt.c \
&& make \
&& make install \
; fi \
# build rabbitmq-c
&& if [ $JANUS_WITH_RABBITMQ = "1" ]; then git clone https://github.com/alanxz/rabbitmq-c ${BUILD_SRC}/rabbitmq-c \
&& cd ${BUILD_SRC}/rabbitmq-c \
&& git submodule init \
&& git submodule update \
&& autoreconf -i \
&& ./configure --prefix=/usr \
&& make \
&& make install \
; fi \
# build janus-gateway
&& git clone -b video_delay_in_simulcast https://github.com/RemoteMonster/janus-gateway.git ${BUILD_SRC}/janus-gateway \
&& cd ${BUILD_SRC}/janus-gateway \
&& ./autogen.sh \
&& ./configure ${JANUS_CONFIG_DEPS} $JANUS_CONFIG_OPTIONS \
&& make \
&& make install \
# folder ownership
&& chown -R janus:janus /opt/janus \
# build cleanup
