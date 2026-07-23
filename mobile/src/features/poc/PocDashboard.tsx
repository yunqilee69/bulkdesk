import React, { useState } from 'react';
import { Button, ScrollView, StatusBar, Text, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DeliveryProofPocScreen } from './DeliveryProofPocScreen';
import { PhotoUploadPocScreen } from './PhotoUploadPocScreen';
import { ScannerPocScreen } from './ScannerPocScreen';
import { SignaturePocScreen } from './SignaturePocScreen';
import { pocStyles } from './pocStyles';

type PocTab = 'scanner' | 'photo' | 'signature' | 'delivery';

function renderTab(tab: PocTab) {
  switch (tab) {
    case 'scanner':
      return <ScannerPocScreen />;
    case 'photo':
      return <PhotoUploadPocScreen />;
    case 'signature':
      return <SignaturePocScreen />;
    case 'delivery':
      return <DeliveryProofPocScreen />;
  }
}

export function PocDashboard() {
  const isDarkMode = useColorScheme() === 'dark';
  const [tab, setTab] = useState<PocTab>('scanner');

  return (
    <SafeAreaProvider>
      <SafeAreaView style={pocStyles.container}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <ScrollView contentContainerStyle={pocStyles.content}>
          <Text style={pocStyles.title}>BulkDesk Mobile Capability POC</Text>
          <Text style={pocStyles.body}>
            已接入真机相机扫码与拍照；签名区支持连续手写并导出 PNG，上传前校验与组合流继续复用同一 contracts。
          </Text>
          <View style={pocStyles.buttonRow}>
            <Button title="扫码" onPress={() => setTab('scanner')} />
            <Button title="拍照上传" onPress={() => setTab('photo')} />
            <Button title="签名" onPress={() => setTab('signature')} />
            <Button title="组合流" onPress={() => setTab('delivery')} />
          </View>
          {renderTab(tab)}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
